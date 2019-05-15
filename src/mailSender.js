const Apify = require('apify');
const { getRunUrl, reasonToString } = require('./utils');

const subject = 'Failed runs at apify.com...';

async function formatMessage(failedRuns) {
    let message = `Found ${failedRuns.length} ${failedRuns.length === 1 ? 'actor/task' : 'actors/tasks'} with failed runs.<br/><br/>`;
    const runFormatter = async (item, run) => {
        const { reason, actual, expected } = run;
        const reasonString = reasonToString(reason, actual, expected);
        const runUrl = await getRunUrl(item.actorId, item.taskId, run.id);
        return `<li><a href="${runUrl}">${run.id}</a>${reasonString !== '' ? ` (${reasonString})` : ''}</li>`;
    };
    for (const item of failedRuns) {
        const objectName = item.taskId ? 'task' : 'actor';
        if (item.failedRuns.length > 1) {
            message += `These runs have failed for ${objectName} "${item.name}":<br/>`;
        } else {
            message += `This run has failed for ${objectName} "${item.name}":<br/>`;
        }
        message += '<ul>';
        for (const run of item.failedRuns) {
            message += `${await runFormatter(item, run)}<br/>`;
        }
        message += '</ul><br/>';
    }

    return message;
}

async function sendEmail(failedRuns, emails) {
    const message = await formatMessage(failedRuns);

    return Apify.call('apify/send-mail', {
        to: emails.join(', '),
        subject,
        html: message,
    });
}

module.exports = sendEmail;
