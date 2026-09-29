export function initialWindowSize(workArea: { width: number; height: number }) {
  const width = Math.min(1280, workArea.width);
  const height = Math.min(840, workArea.height);
  return { width, height, minWidth: Math.min(850, width), minHeight: Math.min(620, height) };
}
