const REASONS = {
    FAILED: 'failed',
    SMALL_DATASET: 'small_dataset',
    EMPTY_DATASET: 'empty_dataset',
    RUNNING_TOO_LONG: 'running_too_long',
    TIMEOUTED: 'timeouted',
    BAD_SCHEMA: 'bad_schema',
};

function validationErrorsKey(runId) {
    return `validation-errors-${runId}`;
}

module.exports = { REASONS, validationErrorsKey };
