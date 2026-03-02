/**
 * Represents the arguments for a job, always including a 'kind' property,
 * and optionally extending with additional custom properties.
 *
 * @template T - Additional properties for the job arguments.
 */
type JobArgs<T extends object = object> = {
  kind: string;
} & T;

export default JobArgs;
