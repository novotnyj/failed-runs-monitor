const { Actor } = require('apify');
const { REASONS } = require('./const');
const { getRunUrl, reasonToEmailString } = require('./utils');

const subject = 'Failed runs at apify.com...';

async function formatMessage(failedRuns) {
    let message = `Found ${failedRuns.length} ${failedRuns.length === 1 ? 'actor/task' : 'actors/tasks'} with failed runs.<br/><br/>`;
    const runFormatter = async (item, run) => {
        const { reason, actual, expected } = run;
        const reasonString = await reasonToEmailString(reason, actual, expected, run);
        const runUrl = getRunUrl(run);
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

async function sendEmail(failedRuns, emails, { smallDatasetNotifications }) {
    if (!smallDatasetNotifications) {
        failedRuns = failedRuns.filter(({ reason }) => reason !== REASONS.SMALL_DATASET);
    }
    const message = await formatMessage(failedRuns);

    const run = await Actor.call('apify/send-mail', {
        to: emails.join(', '),
        subject,
        html: message,
    }, { log: null });
    // SDK v2 threw on a failed call, v3 does not; keep failing the monitor run so a lost email is noticed
    if (run.status !== 'SUCCEEDED') {
        throw new Error(`apify/send-mail run ${run.id} finished with status ${run.status}`);
    }
    return run;
}

module.exports = sendEmail;
