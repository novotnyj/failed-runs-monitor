# Failed Runs Monitor

This actor will let you know about failed runs of your actors via slack message or email. It can also notice you about successful runs with empty dataset, or about runs that are running for too long.

You will receive message like this to your slack or email:
```
Found 1 actor with failed runs.

These runs have failed for actor "failing-actor":
- failedRunId1 (0 items in dataset)
- failedRunId2 (Failed)
```

Where `failedRunId1` and `failedRunId2` will be links to the details of failed runs.


Note: If you want to receive slack notifications then both `Slack API key` and `Slace channel name` have to provided.
