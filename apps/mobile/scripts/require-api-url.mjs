const apiUrl = process.env['VITE_API_URL']?.trim();

if (apiUrl === undefined || apiUrl === '') {
  process.stderr.write(
    '移动端构建需要 VITE_API_URL，例如 VITE_API_URL=https://api.example.com。\n',
  );
  process.exit(1);
}

try {
  const parsed = new URL(apiUrl);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('unsupported protocol');
  }
} catch {
  process.stderr.write('VITE_API_URL 必须是有效的 HTTP 或 HTTPS 地址。\n');
  process.exit(1);
}
