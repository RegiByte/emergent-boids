import { createSubscription } from "./state";

/**
 * Simple stateless dual communication channel supporting multiple workers and watchers.
 */

export function createChannel<TInput, TOutput, TWorkOutput = void>() {
  // Producers put data in this channel
  const inputChannel = createSubscription<TInput>();
  // Consumers pull data from this channel
  const outputChannel = createSubscription<TOutput>();

  return {
    // Input channel for producers
    in: inputChannel,
    // Output channel for consumers
    out: outputChannel,
    // Register a worker function that produces output from input
    work: (
      workerFn: (
        input: TInput,
        resolve: (output: TOutput | TWorkOutput) => void // mark as complete asyncrinously if needed
      ) => TOutput | TWorkOutput
    ) => {
      const cleanup = inputChannel.subscribe((input) => {
        // pass async callback to worker
        const output = workerFn(input, (outAsync) => {
          if (outAsync) {
            outputChannel.notify(outAsync as TOutput);
          }
        });

        // handle synchronous output
        if (output) {
          outputChannel.notify(output as TOutput);
        }
      });
      return () => {
        cleanup();
      };
    },
    // Register a watcher function that receives output from the channel
    watch: (watcherFn: (output: TOutput) => void) => {
      const cleanup = outputChannel.subscribe(watcherFn);
      return () => {
        cleanup();
      };
    },
    // Put data into the channel synchronously
    put: (input: TInput) => {
      inputChannel.notify(input);
    },
    // Clear all workers and watchers, for termination purposes only
    clear: () => {
      inputChannel.clear();
      outputChannel.clear();
    },
  };
}

export type Channel<TInput, TOutput, TWorkOutput = void> = ReturnType<
  typeof createChannel<TInput, TOutput, TWorkOutput>
>;

export type ChannelWorkerFn<TInput, TOutput, TWorkOutput = void> = (
  input: TInput,
  resolve: (output: TOutput | TWorkOutput) => void
) => TOutput | TWorkOutput;
