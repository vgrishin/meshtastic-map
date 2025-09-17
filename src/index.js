const fs = require("fs");
const path = require('path');
const express = require('express');
const compression = require('compression');
const commandLineArgs = require("command-line-args");
const commandLineUsage = require("command-line-usage");

// create prisma db client
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// return big ints as string when using JSON.stringify
BigInt.prototype.toJSON = function() {
    return this.toString();
}

const optionsList = [
    {
        name: 'help',
        alias: 'h',
        type: Boolean,
        description: 'Показать инструкцию.'
    },
    {
        name: "port",
        type: Number,
        description: "Порт для работы Web UI и API.",
    },
];

// parse command line args
const options = commandLineArgs(optionsList);

// show help
if(options.help){
    const usage = commandLineUsage([
        {
            header: 'Карта Meshtastic',
            content: 'Карта всех нод Meshtastic, полученных через MQTT.',
        },
        {
            header: 'Настройки',
            optionList: optionsList,
        },
    ]);
    console.log(usage);
    return;
}

// get options and fallback to default values
const port = options["port"] ?? 8080;

// load json
const hardwareModels = JSON.parse(fs.readFileSync(path.join(__dirname, "json/hardware_models.json"), "utf-8"));
const roles = JSON.parse(fs.readFileSync(path.join(__dirname, "json/roles.json"), "utf-8"));
const regionCodes = JSON.parse(fs.readFileSync(path.join(__dirname, "json/region_codes.json"), "utf-8"));
const modemPresets = JSON.parse(fs.readFileSync(path.join(__dirname, "json/modem_presets.json"), "utf-8"));

// appends extra info for node objects returned from api
function formatNodeInfo(node) {
    return {
        ...node,
        node_id_hex: "!" + node.node_id.toString(16),
        hardware_model_name: hardwareModels[node.hardware_model] ?? null,
        role_name: roles[node.role] ?? null,
        region_name: regionCodes[node.region] ?? null,
        modem_preset_name: modemPresets[node.modem_preset] ?? null,
    };
}

const app = express();

// enable compression
app.use(compression());

// serve files inside the public folder from /
app.use('/', express.static(path.join(__dirname, 'public')));

app.get('/', async (req, res) => {
    res.sendFile(path.join(__dirname, 'public/index.html'));
});

app.get('/api', async (req, res) => {

    const links = [
        {
            "path": "/api",
            "description": "Эта страница",
        },
        {
            "path": "/api/v1/nodes",
            "description": "Все ноды meshtastic",
            "params": {
                "role": "Фильтровать по роли",
                "hardware_model": "Фильтровать по модели оборудования",
            },
        },
        {
            "path": "/api/v1/nodes/:nodeId",
            "description": "Конкретная нода",
        },
        {
            "path": "/api/v1/nodes/:nodeId/device-metrics",
            "description": "Метрики устройства ноды meshtastic",
            "params": {
                "count": "Какое количество вернуть",
                "time_from": "Вернуть только метрики созданные после этого времени timestamp (milliseconds)",
                "time_to": "Вернуть только метрики созданные до этого времени timestamp (milliseconds)",
            },
        },
        {
            "path": "/api/v1/nodes/:nodeId/environment-metrics",
            "description": "Метрики окружения для указанной ноды meshtastic",
            "params": {
                "count": "Какое количество вернуть",
                "time_from": "Вернуть только метрики созданные после этого времени timestamp (milliseconds)",
                "time_to": "Вернуть только метрики созданные до этого времени timestamp (milliseconds)",
            },
        },
        {
            "path": "/api/v1/nodes/:nodeId/power-metrics",
            "description": "Метрики питания для указанной ноды meshtastic",
            "params": {
                "count": "Какое количество вернуть",
                "time_from": "Вернуть только метрики созданные после этого времени timestamp (milliseconds)",
                "time_to": "Вернуть только метрики созданные до этого времени timestamp (milliseconds)",
            },
        },
        {
            "path": "/api/v1/nodes/:nodeId/neighbours",
            "description": "Соседи для указанной ноды meshtastic",
        },
        {
            "path": "/api/v1/nodes/:nodeId/traceroutes",
            "description": "Трассировки для указанной ноды meshtastic",
        },
        {
            "path": "/api/v1/nodes/:nodeId/position-history",
            "description": "История позиций для указанной ноды meshtastic",
            "params": {
                "time_from": "Вернуть только позиции созданные после этого времени timestamp (milliseconds)",
                "time_to": "Вернуть только позиции созданные до этого времени timestamp (milliseconds)",
            },
        },
        {
            "path": "/api/v1/stats/hardware-models",
            "description": "Статистика об известных моделях оборудования",
        },
        {
            "path": "/api/v1/text-messages",
            "description": "Текстовые сообщения",
            "params": {
                "to": "Только сообщения для ноды с этим id",
                "from": "Только сообщения от ноды с этим id",
                "channel_id": "Только сообщения для канала с этим id",
                "gateway_id": "Только сообщения, направленные по mqtt указанной нодой с этим id",
                "last_id": "Вернуть сообщения до или после этого id, в зависимости от сортировки",
                "count": "Какое количество вернуть",
                "order": "Сортировка результата: asc, desc",
            },
        },
        {
            "path": "/api/v1/text-messages/embed",
            "description": "Это сообщение отображено как встроенная HTML-страница.",
        },
        {
            "path": "/api/v1/waypoints",
            "description": "Точки маршрута (waypoints)",
        },
    ];

    const linksHtml = links.map((link) => {
        var line = `<li>`;
        line += `<a href="${link.path}">${link.path}</a> - ${link.description}`;
        line += `<ul>`;
        for(const paramKey in (link.params ?? [])){
            const paramDescription = link.params[paramKey];
            line += "<li>";
            line += `?${paramKey}: ${paramDescription}`;
            line += `</li>`;
        }
        line += `</ul>`;
        return line;
    }).join("");

    res.send(`<b>API Docs</b><br/><ul>${linksHtml}</ul>`);

});

app.get('/api/v1/nodes', async (req, res) => {
    try {

        // get query params
        const role = req.query.role ? parseInt(req.query.role) : undefined;
        const hardwareModel = req.query.hardware_model ? parseInt(req.query.hardware_model) : undefined;

        // get nodes from db
        const nodes = await prisma.node.findMany({
            where: {
                role: role,
                hardware_model: hardwareModel,
            },
        });

        const nodesWithInfo = [];
        for(const node of nodes){
            nodesWithInfo.push(formatNodeInfo(node));
        }

        res.json({
            nodes: nodesWithInfo,
        });

    } catch(err) {
        console.error(err);
        res.status(500).json({
            message: "Что-то пошло не так, попробуйте еще раз позже.",
        });
    }
});

app.get('/api/v1/nodes/:nodeId', async (req, res) => {
    try {

        const nodeId = parseInt(req.params.nodeId);

        // find node
        const node = await prisma.node.findFirst({
            where: {
                node_id: nodeId,
            },
        });

        // make sure node exists
        if(!node){
            res.status(404).json({
                message: "Не найдено",
            });
            return;
        }

        res.json({
            node: formatNodeInfo(node),
        });

    } catch(err) {
        console.error(err);
        res.status(500).json({
            message: "Что-то пошло не так, попробуйте еще раз позже.",
        });
    }
});

app.get('/api/v1/nodes/:nodeId/device-metrics', async (req, res) => {
    try {

        const nodeId = parseInt(req.params.nodeId);
        const count = req.query.count ? parseInt(req.query.count) : undefined;
        const timeFrom = req.query.time_from ? parseInt(req.query.time_from) : undefined;
        const timeTo = req.query.time_to ? parseInt(req.query.time_to) : undefined;

        // find node
        const node = await prisma.node.findFirst({
            where: {
                node_id: nodeId,
            },
        });

        // make sure node exists
        if(!node){
            res.status(404).json({
                message: "Не найдено",
            });
            return;
        }

        // get latest device metrics
        const deviceMetrics = await prisma.deviceMetric.findMany({
            where: {
                node_id: node.node_id,
                created_at: {
                    gte: timeFrom ? new Date(timeFrom) : undefined,
                    lte: timeTo ? new Date(timeTo) : undefined,
                },
            },
            orderBy: {
                id: 'desc',
            },
            take: count,
        });

        res.json({
            device_metrics: deviceMetrics,
        });

    } catch(err) {
        console.error(err);
        res.status(500).json({
            message: "Что-то пошло не так, попробуйте еще раз позже.",
        });
    }
});

app.get('/api/v1/nodes/:nodeId/environment-metrics', async (req, res) => {
    try {

        const nodeId = parseInt(req.params.nodeId);
        const count = req.query.count ? parseInt(req.query.count) : undefined;
        const timeFrom = req.query.time_from ? parseInt(req.query.time_from) : undefined;
        const timeTo = req.query.time_to ? parseInt(req.query.time_to) : undefined;

        // find node
        const node = await prisma.node.findFirst({
            where: {
                node_id: nodeId,
            },
        });

        // make sure node exists
        if(!node){
            res.status(404).json({
                message: "Не найдено",
            });
            return;
        }

        // get latest environment metrics
        const environmentMetrics = await prisma.environmentMetric.findMany({
            where: {
                node_id: node.node_id,
                created_at: {
                    gte: timeFrom ? new Date(timeFrom) : undefined,
                    lte: timeTo ? new Date(timeTo) : undefined,
                },
            },
            orderBy: {
                id: 'desc',
            },
            take: count,
        });

        res.json({
            environment_metrics: environmentMetrics,
        });

    } catch(err) {
        console.error(err);
        res.status(500).json({
            message: "Что-то пошло не так, попробуйте еще раз позже.",
        });
    }
});

app.get('/api/v1/nodes/:nodeId/power-metrics', async (req, res) => {
    try {

        const nodeId = parseInt(req.params.nodeId);
        const count = req.query.count ? parseInt(req.query.count) : undefined;
        const timeFrom = req.query.time_from ? parseInt(req.query.time_from) : undefined;
        const timeTo = req.query.time_to ? parseInt(req.query.time_to) : undefined;

        // find node
        const node = await prisma.node.findFirst({
            where: {
                node_id: nodeId,
            },
        });

        // make sure node exists
        if(!node){
            res.status(404).json({
                message: "Не найдено",
            });
            return;
        }

        // get latest power metrics
        const powerMetrics = await prisma.powerMetric.findMany({
            where: {
                node_id: node.node_id,
                created_at: {
                    gte: timeFrom ? new Date(timeFrom) : undefined,
                    lte: timeTo ? new Date(timeTo) : undefined,
                },
            },
            orderBy: {
                id: 'desc',
            },
            take: count,
        });

        res.json({
            power_metrics: powerMetrics,
        });

    } catch(err) {
        console.error(err);
        res.status(500).json({
            message: "Что-то пошло не так, попробуйте еще раз позже.",
        });
    }
});

app.get('/api/v1/nodes/:nodeId/mqtt-metrics', async (req, res) => {
    try {

        const nodeId = parseInt(req.params.nodeId);

        // find node
        const node = await prisma.node.findFirst({
            where: {
                node_id: nodeId,
            },
        });

        // make sure node exists
        if(!node){
            res.status(404).json({
                message: "Не найдено",
            });
            return;
        }

        // get mqtt topics published to by this node
        const queryResult = await prisma.$queryRaw`select mqtt_topic, count(*) as packet_count, max(created_at) as last_packet_at from service_envelopes where gateway_id = ${nodeId} group by mqtt_topic order by packet_count desc;`;

        res.json({
            mqtt_metrics: queryResult,
        });

    } catch(err) {
        console.error(err);
        res.status(500).json({
            message: "Что-то пошло не так, попробуйте еще раз позже.",
        });
    }
});

app.get('/api/v1/nodes/:nodeId/neighbours', async (req, res) => {
    try {

        const nodeId = parseInt(req.params.nodeId);

        // find node
        const node = await prisma.node.findFirst({
            where: {
                node_id: nodeId,
            },
        });

        // make sure node exists
        if(!node){
            res.status(404).json({
                message: "Не найдено",
            });
            return;
        }

        // get nodes from db that have this node as a neighbour
        const nodesThatHeardUs = await prisma.node.findMany({
            where: {
                neighbours: {
                    array_contains: {
                        node_id: Number(nodeId),
                    },
                },
            },
        });

        res.json({
            nodes_that_we_heard: node.neighbours.map((neighbour) => {
                return {
                    ...neighbour,
                    updated_at: node.neighbours_updated_at,
                };
            }),
            nodes_that_heard_us: nodesThatHeardUs.map((nodeThatHeardUs) => {
                const neighbourInfo = nodeThatHeardUs.neighbours.find((neighbour) => neighbour.node_id.toString() === node.node_id.toString());
                return {
                    node_id: Number(nodeThatHeardUs.node_id),
                    snr: neighbourInfo.snr,
                    updated_at: nodeThatHeardUs.neighbours_updated_at,
                };
            }),
        });

    } catch(err) {
        console.error(err);
        res.status(500).json({
            message: "Что-то пошло не так, попробуйте еще раз позже.",
        });
    }
});

app.get('/api/v1/nodes/:nodeId/traceroutes', async (req, res) => {
    try {

        const nodeId = parseInt(req.params.nodeId);
        const count = req.query.count ? parseInt(req.query.count) : 10; // can't set to null because of $queryRaw

        // find node
        const node = await prisma.node.findFirst({
            where: {
                node_id: nodeId,
            },
        });

        // make sure node exists
        if(!node){
            res.status(404).json({
                message: "Не найдено",
            });
            return;
        }

        // get latest traceroutes
        // We want replies where want_response is false and it will be "to" the
        // requester.
        const traceroutes = await prisma.$queryRaw`SELECT * FROM traceroutes WHERE want_response = false and \`to\` = ${node.node_id} and gateway_id is not null order by id desc limit ${count}`;

        res.json({
            traceroutes: traceroutes.map((trace) => {

                // ensure route is json array
                if(typeof(trace.route) === "string"){
                    trace.route = JSON.parse(trace.route);
                }

                // ensure route_back is json array
                if(typeof(trace.route_back) === "string"){
                    trace.route_back = JSON.parse(trace.route_back);
                }

                // ensure snr_towards is json array
                if(typeof(trace.snr_towards) === "string"){
                    trace.snr_towards = JSON.parse(trace.snr_towards);
                }

                // ensure snr_back is json array
                if(typeof(trace.snr_back) === "string"){
                    trace.snr_back = JSON.parse(trace.snr_back);
                }

                return trace;

            }),
        });

    } catch(err) {
        console.error(err);
        res.status(500).json({
            message: "Что-то пошло не так, попробуйте еще раз позже.",
        });
    }
});

app.get('/api/v1/nodes/:nodeId/position-history', async (req, res) => {
    try {

        // defaults
        const nowInMilliseconds = new Date().getTime();
        const oneHourAgoInMilliseconds = new Date().getTime() - (3600 * 1000);

        // get request params
        const nodeId = parseInt(req.params.nodeId);
        const timeFrom = req.query.time_from ? parseInt(req.query.time_from) : oneHourAgoInMilliseconds;
        const timeTo = req.query.time_to ? parseInt(req.query.time_to) : nowInMilliseconds;

        // find node
        const node = await prisma.node.findFirst({
            where: {
                node_id: nodeId,
            },
        });

        // make sure node exists
        if(!node){
            res.status(404).json({
                message: "Не найдено",
            });
            return;
        }

        const positions = await prisma.position.findMany({
            where: {
                node_id: nodeId,
                created_at: {
                    gte: new Date(timeFrom),
                    lte: new Date(timeTo),
                },
            }
        });

        const mapReports = await prisma.mapReport.findMany({
            where: {
                node_id: nodeId,
                created_at: {
                    gte: new Date(timeFrom),
                    lte: new Date(timeTo),
                },
            }
        });
        
        const positionHistory = []

        positions.forEach((position) => {
            positionHistory.push({
                id: position.id,
                node_id: position.node_id,
                type: "position",
                latitude: position.latitude,
                longitude: position.longitude,
                altitude: position.altitude,
                gateway_id: position.gateway_id,
                channel_id: position.channel_id,
                created_at: position.created_at,
            });
        });

        mapReports.forEach((mapReport) => {
            positionHistory.push({
                node_id: mapReport.node_id,
                type: "map_report",
                latitude: mapReport.latitude,
                longitude: mapReport.longitude,
                altitude: mapReport.altitude,
                created_at: mapReport.created_at,
            });
        });

        // sort oldest to newest
        positionHistory.sort((a, b) => a.created_at - b.created_at);

        res.json({
            position_history: positionHistory,
        });

    } catch(err) {
        console.error(err);
        res.status(500).json({
            message: "Что-то пошло не так, попробуйте еще раз позже.",
        });
    }
});

app.get('/api/v1/stats/hardware-models', async (req, res) => {
    try {

        // get nodes from db
        const results = await prisma.node.groupBy({
            by: ['hardware_model'],
            orderBy: {
                _count: {
                    hardware_model: 'desc',
                },
            },
            _count: {
                hardware_model: true,
            },
        });

        const hardwareModelStats = results.map((result) => {
           return {
               count: result._count.hardware_model,
               hardware_model: result.hardware_model,
               hardware_model_name: hardwareModels[result.hardware_model] ?? "UNKNOWN",
           };
        });

        res.json({
            hardware_model_stats: hardwareModelStats,
        });

    } catch(err) {
        console.error(err);
        res.status(500).json({
            message: "Что-то пошло не так, попробуйте еще раз позже.",
        });
    }
});

app.get('/api/v1/text-messages', async (req, res) => {
    try {

        // get query params
        const to = req.query.to ?? undefined;
        const from = req.query.from ?? undefined;
        const channelId = req.query.channel_id ?? undefined;
        const gatewayId = req.query.gateway_id ?? undefined;
        const directMessageNodeIds = req.query.direct_message_node_ids?.split(",") ?? undefined;
        const lastId = req.query.last_id ? parseInt(req.query.last_id) : undefined;
        const count = req.query.count ? parseInt(req.query.count) : 50;
        const order = req.query.order ?? "asc";

        // if direct message node ids are provided, there should be exactly two node ids
        if(directMessageNodeIds !== undefined && directMessageNodeIds.length !== 2){
            res.status(400).json({
                message: "direct_message_node_ids требует 2 id нод, разделенные запятой.",
            });
            return;
        }

        // default where clauses that should always be used for filtering
        var where = {
            channel_id: channelId,
            gateway_id: gatewayId,
            // when ordered oldest to newest (asc), only get records after last id
            // when ordered newest to oldest (desc), only get records before last id
            id: order === "asc" ? {
                gt: lastId,
            } : {
                lt: lastId,
            },
        };

        // if direct message node ids are provided, we expect exactly 2 node ids
        if(directMessageNodeIds !== undefined && directMessageNodeIds.length === 2){
            // filter message by "to -> from" or "from -> to"
            const [firstNodeId, secondNodeId] = directMessageNodeIds;
            where = {
                AND: where,
                OR: [
                    {
                        to: firstNodeId,
                        from: secondNodeId,
                    },
                    {
                        to: secondNodeId,
                        from: firstNodeId,
                    },
                ],
            };
        } else {
            // filter by to and from
            where = {
                ...where,
                to: to,
                from: from,
            };
        }

        // get text messages from db
        const textMessages = await prisma.textMessage.findMany({
            where: where,
            orderBy: {
                id: order,
            },
            take: count,
        });

        res.json({
            text_messages: textMessages,
        });

    } catch(err) {
        res.status(500).json({
            message: "Что-то пошло не так, попробуйте еще раз позже.",
        });
    }
});

app.get('/api/v1/text-messages/embed', async (req, res) => {
    res.sendFile(path.join(__dirname, 'public/text-messages-embed.html'));
});

app.get('/api/v1/waypoints', async (req, res) => {
    try {

        // get waypoints from db
        const waypoints = await prisma.waypoint.findMany({
            orderBy: {
                id: 'desc',
            },
        });

        // ensure we only have the latest unique waypoints
        // since ordered by newest first, older entries will be ignored
        const uniqueWaypoints = [];
        for(const waypoint of waypoints){

            // skip if we already have a newer entry for this waypoint
            if(uniqueWaypoints.find((w) => w.from === waypoint.from && w.waypoint_id === waypoint.waypoint_id)){
                continue;
            }

            // first time seeing this waypoint, add to unique list
            uniqueWaypoints.push(waypoint);

        }

        // we only want waypoints that haven't expired yet
        const nonExpiredWayPoints = uniqueWaypoints.filter((waypoint) => {
            const nowInSeconds = Math.floor(Date.now() / 1000);
            return waypoint.expire >= nowInSeconds;
        });

        res.json({
            waypoints: nonExpiredWayPoints,
        });

    } catch(err) {
        res.status(500).json({
            message: "Что-то пошло не так, попробуйте еще раз позже.",
        });
    }
});

// start express server
const listener = app.listen(port, () => {
    const port = listener.address().port;
    console.log(`Server running at http://127.0.0.1:${port}`);
});
