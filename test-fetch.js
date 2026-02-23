const https = require('https');

https.get('https://travelplan.vic070680.workers.dev/api/settings', (res) => {
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Headers:', res.headers);
    console.log('Body length:', data.length);
    console.log('Body:', JSON.stringify(data));
  });
}).on('error', (err) => {
  console.log('Error: ', err.message);
});
