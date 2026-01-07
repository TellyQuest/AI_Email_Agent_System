import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { ok, err, Result, createLogger } from '@ai-email-agent/utils';
import { getEnv } from '@ai-email-agent/config';
import { createHash } from 'crypto';
import { Readable } from 'stream';

const logger = createLogger({ service: 'minio-client' });

export interface StorageError {
  code: string;
  message: string;
}

export interface StoredObject {
  path: string;
  bucket: string;
  contentHash: string;
  size: number;
}

export class MinioClient {
  private client: S3Client;
  private bucket: string;

  constructor() {
    const env = getEnv();

    this.bucket = env.MINIO_BUCKET;
    this.client = new S3Client({
      endpoint: `http${env.MINIO_USE_SSL ? 's' : ''}://${env.MINIO_ENDPOINT}`,
      region: 'us-east-1', // MinIO ignores this but SDK requires it
      credentials: {
        accessKeyId: env.MINIO_ACCESS_KEY,
        secretAccessKey: env.MINIO_SECRET_KEY,
      },
      forcePathStyle: true, // Required for MinIO
    });
  }

  async upload(
    path: string,
    content: Buffer | Readable,
    contentType: string
  ): Promise<Result<StoredObject, StorageError>> {
    try {
      // Compute hash for deduplication
      let buffer: Buffer;
      if (content instanceof Readable) {
        const chunks: Buffer[] = [];
        for await (const chunk of content) {
          chunks.push(chunk);
        }
        buffer = Buffer.concat(chunks);
      } else {
        buffer = content;
      }

      const contentHash = createHash('sha256').update(buffer).digest('hex');

      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: path,
          Body: buffer,
          ContentType: contentType,
          Metadata: {
            'x-content-hash': contentHash,
          },
        })
      );

      logger.debug({ path, size: buffer.length }, 'Uploaded object');

      return ok({
        path,
        bucket: this.bucket,
        contentHash,
        size: buffer.length,
      });
    } catch (error) {
      logger.error({ error, path }, 'Failed to upload object');
      return err({
        code: 'UPLOAD_ERROR',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async download(path: string): Promise<Result<Buffer, StorageError>> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: path,
        })
      );

      if (!response.Body) {
        return err({
          code: 'NOT_FOUND',
          message: 'Object body is empty',
        });
      }

      const stream = response.Body as Readable;
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      return ok(Buffer.concat(chunks));
    } catch (error) {
      logger.error({ error, path }, 'Failed to download object');
      return err({
        code: 'DOWNLOAD_ERROR',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async exists(path: string): Promise<Result<boolean, StorageError>> {
    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: path,
        })
      );
      return ok(true);
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'name' in error && error.name === 'NotFound') {
        return ok(false);
      }
      return err({
        code: 'CHECK_ERROR',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async delete(path: string): Promise<Result<void, StorageError>> {
    try {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: path,
        })
      );
      logger.debug({ path }, 'Deleted object');
      return ok(undefined);
    } catch (error) {
      logger.error({ error, path }, 'Failed to delete object');
      return err({
        code: 'DELETE_ERROR',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Upload email attachment with organized path
  async uploadAttachment(
    emailId: string,
    attachmentId: string,
    filename: string,
    content: Buffer,
    contentType: string
  ): Promise<Result<StoredObject, StorageError>> {
    const date = new Date();
    const path = `attachments/${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${emailId}/${attachmentId}/${filename}`;
    return this.upload(path, content, contentType);
  }
}

export const minioClient = new MinioClient();
