import { PgBoss, Job } from 'pg-boss';
import { createLogger } from '@ai-email-agent/utils';
import { sagaRepository, auditRepository } from '@ai-email-agent/database';
import { SagaStepDefinition, StepStatus } from '@ai-email-agent/database';

const logger = createLogger({ service: 'saga-worker' });

interface SagaJob {
  sagaId: string;
  action: 'execute' | 'resume' | 'compensate';
}

export const SAGA_QUEUE = 'saga-execution';
export const ACTION_QUEUE = 'action-execution';

export async function registerSagaWorker(boss: PgBoss): Promise<void> {
  await boss.work<SagaJob>(
    SAGA_QUEUE,
    { batchSize: 5, pollingIntervalSeconds: 2 },
    async (jobs: Job<SagaJob>[]) => {
      for (const job of jobs) {
        const { sagaId, action } = job.data;
        logger.info({ jobId: job.id, sagaId, action }, 'Processing saga');

        try {
          // Get saga
          const sagaResult = await sagaRepository.findById(sagaId);
          if (!sagaResult.ok) {
            throw new Error(`Failed to fetch saga: ${sagaResult.error.message}`);
          }

          const saga = sagaResult.value;
          if (!saga) {
            throw new Error(`Saga not found: ${sagaId}`);
          }

          switch (action) {
            case 'execute':
              await executeSaga(saga, boss);
              break;
            case 'resume':
              await resumeSaga(saga, boss);
              break;
            case 'compensate':
              await compensateSaga(saga);
              break;
            default:
              throw new Error(`Unknown saga action: ${action}`);
          }
        } catch (error) {
          logger.error({ error, sagaId }, 'Saga processing failed');
          throw error;
        }
      }
    }
  );

  logger.info('Saga worker registered');
}

async function executeSaga(
  saga: { id: string; emailId: string; status: string; currentStep: number | null; steps: SagaStepDefinition[] },
  boss: PgBoss
): Promise<{ status: string; completedSteps: number }> {
  // Update status to running
  await sagaRepository.updateStatus(saga.id, 'running');

  await auditRepository.logSagaEvent(
    'saga.started',
    saga.id,
    saga.emailId,
    'Saga execution started',
    { totalSteps: saga.steps.length }
  );

  let completedSteps = 0;

  for (let i = saga.currentStep ?? 0; i < saga.steps.length; i++) {
    const step = saga.steps[i];
    if (!step) {
      logger.warn({ sagaId: saga.id, stepIndex: i }, 'Step not found at index');
      continue;
    }

    // Check if step requires approval
    if (step.requiresApproval && step.status !== 'completed') {
      // Pause saga and wait for approval
      await sagaRepository.updateStatus(saga.id, 'awaiting_approval');

      await auditRepository.logSagaEvent(
        'saga.step_completed',
        saga.id,
        saga.emailId,
        `Saga paused at step ${i + 1}: ${step.name} (requires approval)`,
        { stepIndex: i, stepName: step.name }
      );

      return { status: 'awaiting_approval', completedSteps };
    }

    // Execute step
    const updatedSteps = [...saga.steps];
    const updatedStep: SagaStepDefinition = { ...step, status: 'executing' as StepStatus };
    updatedSteps[i] = updatedStep;
    await sagaRepository.updateSteps(saga.id, updatedSteps);

    try {
      // Queue action for execution via pgBoss
      await boss.send(ACTION_QUEUE, {
        actionId: step.id,
        sagaId: saga.id,
        stepIndex: i,
      });

      // Mark as completed (in real implementation, use events/polling)
      const completedStep: SagaStepDefinition = {
        ...step,
        status: 'completed' as StepStatus,
        executedAt: new Date().toISOString(),
      };
      updatedSteps[i] = completedStep;
      await sagaRepository.updateSteps(saga.id, updatedSteps);
      await sagaRepository.advanceStep(saga.id);

      await auditRepository.logSagaEvent(
        'saga.step_completed',
        saga.id,
        saga.emailId,
        `Step ${i + 1} completed: ${step.name}`,
        { stepIndex: i, stepName: step.name }
      );

      completedSteps++;
    } catch (error) {
      // Step failed, mark saga as failed and trigger compensation
      const failedStep: SagaStepDefinition = {
        ...step,
        status: 'failed' as StepStatus,
        result: {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        },
      };
      updatedSteps[i] = failedStep;
      await sagaRepository.updateSteps(saga.id, updatedSteps);
      await sagaRepository.markFailed(saga.id, error instanceof Error ? error.message : String(error));

      await auditRepository.logSagaEvent(
        'saga.step_failed',
        saga.id,
        saga.emailId,
        `Step ${i + 1} failed: ${step.name} - ${error instanceof Error ? error.message : String(error)}`,
        { stepIndex: i, stepName: step.name, error }
      );

      // Trigger compensation
      await compensateSaga({ ...saga, steps: updatedSteps, currentStep: i });

      return { status: 'failed', completedSteps };
    }
  }

  // All steps completed
  await sagaRepository.updateStatus(saga.id, 'completed');

  await auditRepository.logSagaEvent(
    'saga.completed',
    saga.id,
    saga.emailId,
    'Saga completed successfully',
    { totalSteps: saga.steps.length }
  );

  return { status: 'completed', completedSteps };
}

async function resumeSaga(
  saga: { id: string; emailId: string; status: string; currentStep: number | null; steps: SagaStepDefinition[] },
  boss: PgBoss
): Promise<{ status: string; completedSteps: number }> {
  if (saga.status !== 'awaiting_approval') {
    throw new Error(`Cannot resume saga in status: ${saga.status}`);
  }

  // Mark current step as approved (completed)
  const currentStepIndex = saga.currentStep ?? 0;
  const updatedSteps = [...saga.steps];
  const currentStep = updatedSteps[currentStepIndex];

  if (currentStep) {
    const completedStep: SagaStepDefinition = {
      ...currentStep,
      status: 'completed' as StepStatus,
      executedAt: new Date().toISOString(),
    };
    updatedSteps[currentStepIndex] = completedStep;
  }

  await sagaRepository.updateSteps(saga.id, updatedSteps);
  await sagaRepository.advanceStep(saga.id);

  // Continue execution
  return executeSaga(
    { ...saga, currentStep: currentStepIndex + 1, steps: updatedSteps },
    boss
  );
}

async function compensateSaga(
  saga: { id: string; emailId: string; status: string; currentStep: number | null; steps: SagaStepDefinition[] }
): Promise<{ status: string; compensatedSteps: number }> {
  await sagaRepository.updateStatus(saga.id, 'compensating');

  await auditRepository.logSagaEvent(
    'saga.compensating',
    saga.id,
    saga.emailId,
    'Starting saga compensation',
    { failedStep: saga.currentStep }
  );

  let compensatedSteps = 0;
  const currentStep = saga.currentStep ?? saga.steps.length;

  // Compensate in reverse order
  for (let i = currentStep - 1; i >= 0; i--) {
    const step = saga.steps[i];
    if (!step) {
      continue;
    }

    // Only compensate completed steps that have compensation defined
    if (step.status !== 'completed' || !step.compensation) {
      continue;
    }

    // Check if reversible
    if (step.reversibility === 'hard_irreversible') {
      logger.warn(
        { sagaId: saga.id, stepIndex: i },
        'Step is hard irreversible, cannot compensate'
      );
      continue;
    }

    const updatedSteps = [...saga.steps];

    try {
      // Execute compensation (in real implementation, call actual APIs)
      logger.info(
        { sagaId: saga.id, stepIndex: i, compensation: step.compensation },
        'Executing compensation'
      );

      const compensatedStep: SagaStepDefinition = {
        ...step,
        status: 'compensated' as StepStatus,
        compensatedAt: new Date().toISOString(),
      };
      updatedSteps[i] = compensatedStep;
      await sagaRepository.updateSteps(saga.id, updatedSteps);

      compensatedSteps++;
    } catch (error) {
      logger.error(
        { error, sagaId: saga.id, stepIndex: i },
        'Compensation failed for step'
      );
      // Continue trying to compensate other steps
    }
  }

  await sagaRepository.updateStatus(saga.id, 'compensated');

  await auditRepository.logSagaEvent(
    'saga.compensated',
    saga.id,
    saga.emailId,
    `Saga compensation completed (${compensatedSteps} steps compensated)`,
    { compensatedSteps }
  );

  return { status: 'compensated', compensatedSteps };
}
