var ReverseTunnelClient = require("tunnel").ReverseTunnelClient,
  connect = require("connect"),
  sys = require("sys"),
  _ = require("underscore"),
  qs = require("qs");

function ReverseTunnelClientManager() {
  _.bindAll(this, 'buildRoutes');
  this.tunnels = [];
  this.index = 0;
}

ReverseTunnelClientManager.prototype = {

  listen : function(port) {
    var router = connect.router(this.buildRoutes);
    connect(connect.bodyParser(), connect.logger(), router)
      .listen(port);
  },

  buildRoutes : function(app) {
    var self = this,
      headers = {'Content-Type': 'application/json'};

    function end(res, code, data) {
      res.writeHead(code, headers);
      res.end(data);
    }

    app.get('/', function(req, res, body) {
      var activeTunnels = _(self.tunnels).compact();
      end(res, 200, JSON.stringify(activeTunnels));
    });

    app.put('/', function(req, res, body) {
      var client,
        id = self.index++;
      client = new ReverseTunnelClient(req.body);
      client.connect();
      self.tunnels[id] = {id: id, client: client, createdAt: new Date()};
      end(res, 200, JSON.stringify(self.tunnels[id]));
    });

    app.get('/:id', function(req, res, body) {
      var id = req.params.id;
      if(self.tunnels[id]) {
        end(res, 200, JSON.stringify(self.tunnels[id]));
      } else {
        end(res, 404, JSON.stringify({ response: "Tunnel not found" }));
      }
    });


    app.del('/:id', function(req, res, body) {
      var id = req.params.id, response;
      if(self.tunnels[id]) {
        /* can't really close tunnels, for now */
        self.tunnels[id] = null;
        response = { response: "Tunnel closed" };
        self.tunnels[id] = null;
        end(res, 200, JSON.stringify(response));
      } else {
        response = { response: "There is no active tunnel with id: " + id };
        end(res, 500, JSON.stringify(response));
      }
    });
  }

}

/*
 * var r = new ReverseTunnelClientManager();
 * r.listen(2000);
 */

