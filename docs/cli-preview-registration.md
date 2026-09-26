# CLI preview registration

The preview shortcut follows a local preview registered by the CLI command
that owns it. Agent transcript lines are display content and cannot register,
replace or stop that preview.

Verify that ordinary and multiline transcript text cannot change the shortcut,
including text that resembles CLI status output. Starting an owned local preview
must enable the shortcut; stopping that preview must clear it through the same
structured lifecycle.
