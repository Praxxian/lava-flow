# Lava Flow
This module allows you to import your notes from Obsidian MD into Foundry journal entries.

## Features
- Select your whole vault or even just one folder within it. Or even just any folder with .md files.
- Uses [showdown](https://github.com/showdownjs/showdown) to convert markdown to HTML.
- Replaces Obsidian links with journal entry links in Foundry.
- Overwrite or ignore existing journal entries.
- Give your players permission to observe all notes or not during import.
- Optional index Journal entry which lists all your notes under their top-level folder.
- Optional "Reference" section which adds backlinks to each journal entry, similar to Obsidian MD's backlinks.
- All created folders have the flag "lavaFlowFolder" and likewise journal entries will have the flag "lavaFlowJournalEntry".

## How to Use
1. Under the Journal tab, there is an "Import Obsidian Vault" button.\
![image](https://user-images.githubusercontent.com/54974037/146979663-d754caeb-df13-454c-8b2a-00ecce5ff8a4.png)
1. Click this to open the import menu.\
![image](https://user-images.githubusercontent.com/54974037/146979742-5c8ae2b6-9194-420a-9fad-e38294b5a2ed.png)
1. Name the top journal folder you wish to place your notes in. If this folder does not already exist, it will be created. Leaving this blank will place your notes directly into your journal entries.
1. Select the folder you wish to import. This can be any folder within your vault, including the root, or any folder with markdown files.
1. Select if you wish to overwrite journal entries that already exist with the same name in the same folder.
    - (Optional) If you do not wish to overwrite existing journal entries, you can choose to skip duplicates.
1. Select if all players should have the [Observer](https://foundryvtt.com/article/users/) permission on the notes that get imported.
1. Select if you wish to create an Index journal entry. This lists links to every imported entry, organized by their top-level folder.\
![image](https://user-images.githubusercontent.com/54974037/146980929-400ce499-c352-47a1-890a-5f3ae574b8d3.png)
1. Select if you wish to create backlinks in each imported journal entry. This creates a "Reference" section to the end of each journal entry, linking to all the journal entries that reference it.\
![image](https://user-images.githubusercontent.com/54974037/146981259-6755cb58-a4d6-4df6-9473-8ad8c5914182.png)

## Limitations
- Folder depth is limited to Foundry's folder depth limit.
- Importing non-markdown files is not currently supporting. These will be skipped.

## License
Lava Flow is released under the MIT License.