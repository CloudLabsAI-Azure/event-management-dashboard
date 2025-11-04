// Small script to POST login payload to local backend using global fetch
// Run with: node backend/tmp_post.js

async function main() {
  try {
    const res = await fetch('http://localhost:4000/api/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'password' }),
    });
    const text = await res.text();
    console.log('HTTP', res.status, res.statusText);
    console.log('BODY:\n', text);
  } catch (err) {
    console.error('Request error', err && err.stack ? err.stack : err);
  }
}

main();
