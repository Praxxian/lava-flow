import LavaFlow from './lava-flow.js';

export async function createOrGetFolder(
  folderName: string | null,
  parentFolderID: string | null = null,
): Promise<Folder | null> {
  if (folderName == null || folderName === '') return null;
  const folder = (await getFolder(folderName, parentFolderID)) ?? (await createFolder(folderName, parentFolderID));
  return folder;
}

export async function getFolder(folderName: string, parentFolderID: string | null): Promise<Folder | null> {
  if (parentFolderID !== null) {
    const parent = (game as Game).folders?.get(parentFolderID) as Folder;
    // v10 not supported by foundry-vtt-types yet
    // @ts-expect-error
    const matches = parent.children.filter((c) => c.folder.name === folderName) ?? [];
    return matches.length > 0 ? (matches[0].folder as Folder) : null;
  } else {
    return (
      (game as Game).folders?.find((f) => f.type === 'JournalEntry' && f.depth === 1 && f.name === folderName) ?? null
    );
  }
}

export async function createFolder(folderName: string, parentFolderID: string | null): Promise<Folder | null> {
  const folder = await Folder.create({
    name: folderName,
    type: 'JournalEntry',
    folder: parentFolderID,
  });
  await folder?.setFlag(LavaFlow.FLAGS.SCOPE, LavaFlow.FLAGS.FOLDER, true);
  return folder ?? null;
}
