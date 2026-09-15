/**
 * Format angka jadi readable (1000 -> 1K)
 */
function formatNumber(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}

/**
 * Delay/sleep function
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Escape special characters untuk WhatsApp
 */
function escapeMarkdown(text) {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\*/g, '\\*')
    .replace(/_/g, '\\_')
    .replace(/~/g, '\\~')
    .replace(/`/g, '\\`');
}

/**
 * Buat progress bar
 */
function progressBar(percentage) {
  const filled = Math.round(percentage / 10);
  const empty = 10 - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

module.exports = {
  formatNumber,
  sleep,
  escapeMarkdown,
  progressBar,
};
