const Apify = require('apify');
const { getRunUrl, reasonToString } = require('./utils');

const subject = 'Failed runs at apify.com...';

function formatMessage(failedRuns) {
    let message = `Found ${failedRuns.length} ${failedRuns.length === 1 ? 'actor' : 'actors'} with failed runs.<br/><br/>`;
    const runFormatter = (item, run) => {
        const { reason } = run;
        const reasonString = reasonToString(reason);
        return `<li><a href="${getRunUrl(item.actorId, run.id)}">${run.id}</a>${reasonString !== '' ? ` (${reason})` : ''}</li>`;
    };
    for (const item of failedRuns) {
        if (item.failedRuns.length > 1) {
            message += `These runs have failed for actor "${item.name}":<br/>`;
        } else {
            message += `This run has failed for actor "${item.name}":<br/>`;
        }
        message += '<ul>';
        message += item.failedRuns.map((run) => runFormatter(item, run));
        message += '</ul><br/>';
    }

    return message;
}

async function sendEmail(failedRuns, emails) {
    const message = formatMessage(failedRuns);

    await Apify.call('apify/send-mail', {
        to: emails.join(', '),
        subject,
        html: message,
    });
}

module.exports = sendEmail;
