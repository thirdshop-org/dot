import { Folder } from "./safDirectory"

const folders = new Map<Folder['uri'],FolderContext>();

type FolderContext = {
    syncStatus: 'local' | 'cloud' | 'local-cloud'
    addedAt: number // UTC DATE
    folder: Folder
}

export async function saveDirectory(folder: Folder): Promise<boolean> {

    const ctx = {
        syncStatus: 'local',
        addedAt: Date.UTC(Date.now()),
        folder: folder,
    } satisfies FolderContext;

    folders.set(folder.uri,ctx)
    
    return new Promise(()=> true)
}

export async function getFolders(): Promise<FolderContext[]>{
    
    return new Promise(()=> folders.values()) 

}

export type UserPreferences = {
    syncMode: 'full' | 'manual' | 'none'
}

export async function getUserPreferences(): Promise<UserPreferences> {

    return new Promise((resolve)=>{
        resolve({
            syncMode: 'full'
        } satisfies UserPreferences)
    });

}