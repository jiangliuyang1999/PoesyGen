import figlet from 'figlet';

export function formatCliBanner(): string {
  const title = figlet
    .textSync('PoesyGen', {
      font: 'Standard',
      horizontalLayout: 'default',
      verticalLayout: 'default',
    })
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trimEnd();
  return `${title}\n\nPoesyGen · 格律诗词作`;
}
