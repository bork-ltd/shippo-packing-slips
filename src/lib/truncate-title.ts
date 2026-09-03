const PIPE = '|';

/**
 * Truncate a product title at its second '|' separator, dropping that
 * character and everything after it. Some shop apps append a long list of
 * compatible sizes/specs after a second pipe (e.g.
 * "Battery Tray | Small Deep Bins | AA AAA 9V C D CR2 ..."); that tail isn't
 * useful on a packing slip and crowds out the parts that matter.
 * @param title - Raw product title
 * @returns The title truncated before its second pipe, trimmed of trailing
 *   whitespace; unchanged if it has fewer than two pipes
 */
export function truncateAtSecondPipe(title: string): string {
  const firstPipeIndex = title.indexOf(PIPE);
  if (firstPipeIndex === -1) {
    return title;
  }

  const secondPipeIndex = title.indexOf(PIPE, firstPipeIndex + 1);
  if (secondPipeIndex === -1) {
    return title;
  }

  return title.slice(0, secondPipeIndex).trimEnd();
}
