export const defaultModel = 'Uniform deterministic bit algorithm with worst-case running time.';

export function algorithmModel(record) {
  return record.modelException?.description ?? record.model ?? defaultModel;
}
