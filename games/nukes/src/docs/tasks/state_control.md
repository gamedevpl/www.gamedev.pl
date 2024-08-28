# Summary

The user should be able to control the player controlled state

# Description

The task is about implementing a change in game mechanics, and adding a new element to the UI.

One of the states is marked as player controlled. The player is already able to launch missiles by selecting a launch site and pointing to a target.

Now we are introducing a more high level approach to controlling the state.

Here are the operations that the player should be able to select their strategy against other states:

- NEUTRAL: Do not attack, defend cities if attacked
- FRIENDLY: Do not attack, assume the other state missiles are not a threat
- HOSTILE: Attack the other state

The player will be still able to manually launch missiles if they want.

Computer controlled states should start with NEUTRAL strategy by default.

## Implementation hints

### Game mechanics

We are introducing a new property to the `State` type. It should store the information about strategies selected for each of other states.
Probably the map should take the `StateId` as key, and the value should be a new enum type which will have the strategy options as values.

The information about strategy then should be used by `generateLaunches` function. The function should now also work for the player controlled state.

### UI

`StateControl` is the UI component which allows the player to control the strategy.
It should display list of other states, and an option to select the strategy for each of them.
