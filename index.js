const express = require('express')
const config = require('./config.json')
const mcping = require('mcping-js')
const dns = require('dns')

const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('stats.db');
db.run("CREATE TABLE IF NOT EXISTS stats (ingame INTEGER, regular INTEGER, prio INTEGER, total INTEGER, time INTEGER)");

// Prevent corruption
db.run('PRAGMA synchronous=FULL')
db.run('PRAGMA count_changes=OFF')
db.run('PRAGMA journal_mode=DELETE')
db.run('PRAGMA temp_store=DEFAULT')
let cacheddb = {}


db.all(`SELECT * FROM stats;`, function (err, data) {
    if (err) {
        console.log(err)
    } else {
        cacheddb = data;
    }
})
let pingertime = config.PingerTime

const app = express()

let current = {}

let pingip = config.ip;
let port = config.port
setInterval(() => {
    dns.resolveSrv('_minecraft._tcp.' + pingip, (err, records) => {
        if (!((err && (err.code === 'ENOTFOUND' || err.code === 'ENODATA')) || !records || records.length === 0)) {
            pingip = records[0].name
            port = records[0].port
        }

        const server = new mcping.MinecraftServer(pingip, port)
        server.ping(5000, 340, (err, res) => {
            if (res && res["players"].sample && res["players"].sample[2]) {
                let ingameraw = res["players"].sample[0]["name"]
                let regularraw = res["players"].sample[1]["name"]
                let prioraw = res["players"].sample[2]["name"]

                let ingame = Number(ingameraw.substring(ingameraw.indexOf(':') + 1).trim());
                let regular = Number(regularraw.substring(regularraw.indexOf(':') + 1).trim());
                let prio = Number(prioraw.substring(prioraw.indexOf(':') + 1).trim());
                let total = res["players"].online
                console.log("IN-GAME: " + ingame + " REGULAR: " + regular + " PRIO: " + prio + " TOTAL: " + total)

                db.serialize(function () {
                    let stmt = db.prepare(`INSERT INTO stats (ingame, regular, prio, total,time) VALUES (?,?,?,?,?)`);
                    stmt.run(ingame, regular, prio, total, new Date());
                    stmt.finalize();
                });
                current.ingame = ingame;
                current.regular = regular;
                current.prio = prio;
                current.total = total;
                current.time = new Date().getTime();
            } else {
                console.log("\x1b[31mFailed to ping - Resetting timeout\x1b[0m")
            }
        })
    })

}, pingertime)


setInterval(() => {
    db.all(`SELECT * FROM stats;`, function (err, data) {
        if (err) {
            console.log(err)
        } else {
            cacheddb = data;
        }
    })
}, 10000)

function getPart(string){
    return cacheddb.map(b => {
        return [b.time, b[string]];
    });
}
app.get(`/`, (req, res) => {
    res.sendFile(__dirname + '/index.html')
})

app.get(`/ingame`, (req, res) => {
  res.send(getPart("ingame"))
})

app.get(`/regular`, (req, res) => {
    res.send(getPart("regular"))
})
app.get(`/prio`, (req, res) => {
    res.send(getPart("prio"))
})
app.get(`/total`, (req, res) => {
    res.send(getPart("total"))
})

app.get('/current', (req, res) => {
    res.send(current)
})
app.get(`/all`, (req, res) => {
    res.send(cacheddb)
})

app.listen(config.expressport, config.expressip)