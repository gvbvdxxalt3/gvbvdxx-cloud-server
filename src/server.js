var wss = require("./ws-server.js");
var http = require("http");

var path = require("path");
var fs = require("fs");
var URL = require("url");

function setNoCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
}

function runStaticStuff(req, res, forceStatus) {
  var url = URL.parse(req.url);
  var pathname = url.pathname;

  setNoCorsHeaders(res);

  var file = path.join("./public/", pathname);
  if (pathname == "/") {
    file = "public/index.html";
  }
  if (file.split(".").length < 2) {
    file += ".html";
  }

  if (!fs.existsSync(file)) {
    file = "errors/404.html";
    res.statusCode = 404;
  }

  if (typeof forceStatus !== "undefined") {
    file = "errors/" + forceStatus + ".html";
    res.statusCode = forceStatus;
  }

  fs.createReadStream(file).pipe(res);
}

var server = http.createServer((req,res) => {
  runStaticStuff(req,res);
});

var managerScript = require("./custom-manager-script.js");
managerScript(wss._gvbvdxxCloudServer,wss);

server.on("upgrade", function upgrade(request, socket, head) {  
  wss.handleUpgrade(request, socket, head, function done(ws) {
    wss.emit("connection", ws, request);
  });
});

server.listen(8080);
console.log("Gvbvdxx Cloud Extension Server listening on port 8080!");
