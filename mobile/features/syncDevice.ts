import { getUserPreferences } from "../services/localStorage";
import type { UserPreferences } from "../services/localStorage"

let syncStartedAt: null | number = null;

export async function useSyncDevice() {

    initialize()

    async function initialize() {
        
        if ( syncStartedAt ) return;

        syncStartedAt = Date.UTC(Date.now());

        while (true) {

            await sync()

            await new Promise((resolve)=>{
                setTimeout(() => {
                    resolve(true)
                }, 1000);
            })
        }
 
    }

    async function sync() {

        console.info("Sync started")

        const userPreferences = await getUserPreferences()

        console.log(userPreferences)

    }
 
    async function setSyncMode( mode: UserPreferences ) {

    }

    return {

    }

}