// src/lib/db.ts
import Dexie, { type Table } from 'dexie'
import type { ScoutingData, ScoutingStatus } from '@/types'

export type ScoutingDataWithKey = ScoutingData & {
    key: string
    status: ScoutingStatus
}

function makeScoutingKey(match_type: string, match: number, teamNumber: number): string {
    return `${match_type}|${match}|${teamNumber}`
}

class ScoutingAppDB extends Dexie {
    scouting!: Table<ScoutingDataWithKey, string>

    constructor() {
        super('ScoutingAppDB')
        this.version(1).stores({
            // Indexed fields: primary key and searchable fields
            // Added 'status' to the index so it can be queried
            scouting: '&key,match,teamNumber,match_type,status'
        })
    }
}

export const db = new ScoutingAppDB()

export async function saveScoutingData(data: ScoutingData, status: ScoutingStatus) {
    const { match, match_type, teamNumber } = data
    if (
        match == null ||
        !match_type ||
        teamNumber == null
    ) {
        throw new Error('match, match_type, and teamNumber must be set to generate a key')
    }

    const key = makeScoutingKey(match_type, match, teamNumber)
    // Deep-clone the data to ensure all nested proxies are stripped
    const entry: ScoutingDataWithKey = {
        ...(structuredClone ? structuredClone(data) : JSON.parse(JSON.stringify(data))),
        key,
        status,
    }

    try {
        await db.scouting.put(entry)
    } catch (err) {
        console.error('Failed to save scouting data:', err)
        throw err
    }
}

export async function getScoutingData(match_type: string, match: number, teamNumber: number) {
    const key = makeScoutingKey(match_type, match, teamNumber)
    try {
        const raw = await db.scouting.get(key)
        // Always deep-clone when returning, so the caller gets a fresh object
        return raw
            ? (structuredClone ? structuredClone(raw) : JSON.parse(JSON.stringify(raw)))
            : null
    } catch (err) {
        console.error('Failed to get scouting data:', err)
        throw err
    }
}


export async function getAllScoutingKeys(): Promise<string[]> {
    try {
        return (await db.scouting.orderBy('key').keys()) as string[]
    } catch (err) {
        console.error('Failed to fetch scouting keys:', err)
        throw err
    }
}

export async function deleteScoutingData(match_type: string, match: number, teamNumber: number): Promise<void> {
    const key = makeScoutingKey(match_type, match, teamNumber)
    try {
        await db.scouting.delete(key)
    } catch (err) {
        console.error('Failed to delete scouting data:', err)
        throw err
    }
}

export async function updateScoutingStatus(
    match_type: string,
    match: number,
    teamNumber: number,
    status: ScoutingStatus
) {
    const key = makeScoutingKey(match_type, match, teamNumber)
    const existing = await db.scouting.get(key)
    if (!existing) return

    await db.scouting.put({ ...existing, status })
}
