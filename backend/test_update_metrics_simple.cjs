(async () => {
  try {
    const fetch = global.fetch || (await import('node:undici')).fetch;
    const loginRes = await fetch('http://localhost:4000/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'password' }),
    });
    const login = await loginRes.json();
    console.log('LOGIN:', login);
    if (!login.token) return process.exit(1);
    const token = login.token;
    const newMetrics = { tracksDelivered: 321, techEvents: 300, nonTechEvents: 21, languagesCovered: 4, topTracks: [] };
    const putRes = await fetch('http://localhost:4000/api/metrics', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify(newMetrics),
    });
    console.log('PUT status', putRes.status);
    console.log('PUT body:', await putRes.json());
    const getRes = await fetch('http://localhost:4000/api/metrics');
    console.log('GET:', await getRes.json());
  } catch (e) {
    console.error('ERR', e);
    process.exit(1);
  }
})();
