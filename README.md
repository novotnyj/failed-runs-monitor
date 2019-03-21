# Failed Runs Monitor

This actor will let you know about failed and timed out runs of your actors via slack message or email. It can also notice you about successful runs with empty/small dataset, or about runs that are running for too long.

You will receive message like this to your slack or email:
```
Found 1 actor with failed runs.

These runs have failed for actor "failing-actor":
- failed-run-id-1 (More than 250 dataset items expected, 10 found)
- failed-run-id-2 (Should have finished in 3 hours, running for 5 hours)
- failed-run-id-2 (Failed)
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
        }
    ],
    // Optional
    "slackApiKey": "secret-api-key",
    // Optional
    "slackChannel": "#actor-notifications",
    // Optional
    "emails": ["john.doe@examle.com"]
}
```

Config is an array of objects, where every object has these attributes:
- `actorId` - String, ID of the actor, this is required property.
- `minDatasetItems` - Integer, If provided, then successful runs with less than `minDatasetItems` items in default dataset are considered as failed,
- `maxRunTimeSecs` - Integer, If provided, then runs running longer than `maxRunTimeSecs` are considered as failed.

Note: If you want to receive slack notifications then both `Slack API key` and `Slack channel name` have to provided.
