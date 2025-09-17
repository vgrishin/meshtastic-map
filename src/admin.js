// node src/admin.js --purge-node-id 123
// node src/admin.js --purge-node-id '!AABBCCDD'

const commandLineArgs = require("command-line-args");
const commandLineUsage = require("command-line-usage");

// create prisma db client
const { PrismaClient } = require("@prisma/client");
const NodeIdUtil = require("./utils/node_id_util");
const prisma = new PrismaClient();

const optionsList = [
    {
        name: 'help',
        alias: 'h',
        type: Boolean,
        description: 'Показать инструкцию.'
    },
    {
        name: "purge-node-id",
        type: String,
        description: "Удалить все записи для указанного ID ноды.",
    },
];

// parse command line args
const options = commandLineArgs(optionsList);

// show help
if(options.help){
    const usage = commandLineUsage([
        {
            header: 'Администрирование Карты Meshtastic',
            content: 'Утилита командной строки для администрирования карты Meshtastic',
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
const purgeNodeId = options["purge-node-id"] ?? null;

async function purgeNodeById(nodeId) {

    // convert to numeric id
    nodeId = NodeIdUtil.convertToNumeric(nodeId);

    // purge environment metrics
    await prisma.environmentMetric.deleteMany({
        where: {
            node_id: nodeId,
        },
    });

    // purge map reports
    await prisma.mapReport.deleteMany({
        where: {
            node_id: nodeId,
        },
    });

    // purge neighbour infos
    await prisma.neighbourInfo.deleteMany({
        where: {
            node_id: nodeId,
        },
    });

    // purge this node
    await prisma.node.deleteMany({
        where: {
            node_id: nodeId,
        },
    });

    // purge positions
    await prisma.position.deleteMany({
        where: {
            node_id: nodeId,
        },
    });

    // purge power metrics
    await prisma.powerMetric.deleteMany({
        where: {
            node_id: nodeId,
        },
    });

    // purge text messages
    await prisma.textMessage.deleteMany({
        where: {
            from: nodeId,
        },
    });

    // purge traceroutes
    await prisma.traceRoute.deleteMany({
        where: {
            from: nodeId,
        },
    });

    // purge waypoints
    await prisma.waypoint.deleteMany({
        where: {
            from: nodeId,
        },
    });

    console.log(`✅ Node '${nodeId}' has been purged from the database.`);

}

(async () => {

    // purge node by id
    if(purgeNodeId){
        await purgeNodeById(purgeNodeId);
    }

})();
