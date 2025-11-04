const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));

(async () => {
  try {
    const loginRes = await fetch('http://localhost:4000/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'password' }),
    });
    const login = await loginRes.json();
    console.log('LOGIN:', login);
    if (!login.token) return process.exit(1);
    const token = login.token;
    const newMetrics = { tracksDelivered: 777, techEvents: 700, nonTechEvents: 77, languagesCovered: 10, topTracks: [] };
    const putRes = await fetch('http://localhost:4000/api/metrics', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify(newMetrics),
    });
    console.log('PUT:', await putRes.json());
    const getRes = await fetch('http://localhost:4000/api/metrics');
    console.log('GET:', await getRes.json());
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();
