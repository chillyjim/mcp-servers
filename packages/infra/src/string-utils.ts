// Utility for string checks
export function nullOrEmpty(val?: string): boolean {
  return (
    val === undefined ||
    val === null ||
    (typeof val === 'string' && (val.trim() === '' || val === 'undefined' || val === 'null'))
  );
}
