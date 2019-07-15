# Failed Runs Monitor

This actor will let you know about failed and timed out runs of your actors or tasks via Slack or email. It could also notice you about successful runs with empty/small dataset or runs that are running for too long.

You will receive message like this to your slack or email:
```
Found 1 actor/task with failed runs.

These runs have failed for actor "failing-actor":
- failed-run-id-1 (More than 250 dataset items expected, 10 found)
- failed-run-id-2 (Should have finished in 3 hours, running for 5 hours)
- failed-run-id-3 (Failed)
- failed-run-id-4 (Timed out)
```

Where `failedRunIdX` will be links to the details of failed runs.

## INPUT

Example of the input:

```
{
    // Required
    "config": [
        {
            // Required
            "actorId": "bbb",
            // Optional
            "minDatasetItems": 10,
            // Optional
            "maxRunTimeSecs": 3600
        },
        {
            "taskId": "aaa",
            "minDatasetItems": 10
        }
    ],
    // Optional
    "slackApiKey": "secret-api-key",
    // Optional
    "slackChannel": "#actor-notifications",
    // Optional
    "emails": ["john.doe@examle.com"],
    // Optional
    "inputMask": { "testRun": true },
    // Optional
    "ignoreByInputMask": false,
    // Optional
    "schema": {}
}
```

Config is an array of objects, where every object has these attributes:
- `actorId` - String, ID of the actor to monitor, One of `actorId` or `taskId` has to be provided
- `taskId` - String, ID of the task to monitor, One of `actorId` or `taskId` has to be provided
- `minDatasetItems` - Integer, If provided, then successful runs with less than `minDatasetItems` items in default dataset are considered as failed
- `maxRunTimeSecs` - Integer, If provided, then runs running longer than `maxRunTimeSecs` are considered as failed

Note: If you want to receive slack notifications then both `slackApiKey` and `slackChannel` have to provided.

### Input mask

Use this option to check only runs that contain something on input.

This option can be used in combinanion with `ignoreByInputMask`. If `ignoreByInputMask` is set to true, than matched runs will be ignored. This is useful when you need to skip some testing runs.

### JSON Schema

Every dataset item will be checked using JSON schema given in `schema`.
