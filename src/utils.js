function getRunUrl(actId, runId) {
    return `https://my.apify.com/actors/${actId}#/runs/${runId}`;
}

module.exports = { getRunUrl };
