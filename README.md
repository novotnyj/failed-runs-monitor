# Failed Runs Monitor

This actor will let you know about failed runs of your actors via slack message or email.

You will receive message like this to your slack or email:
```
Found 1 actor with failed run.

Thess runs have failed for actor "failing-actor":
- failedRunId1
- failedRunId2
```

Where `failedRunId1` and `failedRunId2` will be links to the details of failed runs.


Note: If you want to receive slack notifications then both `Slack API key` and `Slace channel name` have to provided.
