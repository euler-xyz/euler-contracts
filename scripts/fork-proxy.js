const http = require('http');
const httpProxy = require('http-proxy');

const port = 7888;
const username = 'euler';
const password = 'b0t5__b3_9one';

const authBuffer = Buffer.from(username + ':' + password, 'ascii');
const authToken = 'Basic ' + authBuffer.toString('base64');

const proxy = httpProxy.createProxyServer({
  host: process.argv[2],
  port: 8545,
});


const server = http.createServer((req, res) => {
  var authHeader = req.headers['authorization'];
  if (authHeader === authToken) {
    proxy.web(req, res);
  } else {
    res.statusCode = 404;
    res.end();
  }
});

server.on('upgrade', function (req, socket, head) {
  var authHeader = req.headers['authorization'];
  if (authHeader === authToken) {
    proxy.ws(req, socket, head);
  } else {
    res.statusCode = 404;
    res.end();
  }
});

server.timeout = 600000;

server.on('clientError', (err, socket) => {
  console.error('[%s] [error %s] %s', new Date, err.message);
  socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
});

console.log("proxy listening on port %d", port)
server.listen(port);