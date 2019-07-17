# Failed Runs Monitor

This actor will let you know about failed or time outed runs of your actors and tasks via Slack or email. It can also notice you about successful runs with empty dataset, check JSON schema of dataset items, or about runs that are running for too long.

You will receive message like this to your slack or email:
```
Found 1 actor/task with failed runs.

These runs have failed for actor "failing-actor":
- failed-run-id-1 (More than 250 dataset items expected, 10 found)
- failed-run-id-2 (Should have finished in 3 hours, running for 5 hours)
- failed-run-id-3 (Failed)
- failed-run-id-4 (Timed out)
- failed-run-id-5 (9 items did not match JSON schema)
```

Where `failed-run-id-X` will be links to the details of failed runs.

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

You can use `inputMask` option to check only runs that contain something on input.

This option can be used in combinanion with `ignoreByInputMask`. If `ignoreByInputMask` is set to true, than matched runs will be ignored. This is useful when you need to skip testing runs.

### JSON Schema

Every item in dataset will be checked using JSON schema given in `schema`. Invalid items are reported in log and also saved to key-value store using this key `validation-errors-${run.id}`.
