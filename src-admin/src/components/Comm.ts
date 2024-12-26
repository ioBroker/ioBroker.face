import type { ENGINE, PERSON_ID, TOKEN } from '../types';
const URL = 'https://face.iobroker.in/';

export type STATISTICS = {
    usage: Record<ENGINE, { monthly: number; daily: number; lastTime: number }>;
    limits: Record<ENGINE, { daily: number; monthly: number }>;
    licenseTill: number;
};

export class Comm {
    static async deletePerson(accessToken: TOKEN, personId: PERSON_ID): Promise<number> {
        const response = await fetch(`${URL}person/${personId}`, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
            method: 'DELETE',
        });
        const data: { persons: number } = await response.json();
        return data.persons;
    }

    static async readPersons(accessToken: TOKEN): Promise<{
        persons: {
            name: string;
            id: PERSON_ID;
            iobroker?: { enrolled: boolean; monthly: number; daily: number; lastTime: number };
            advanced?: { enrolled: boolean; monthly: number; daily: number; lastTime: number };
        }[];
        stats: STATISTICS;
    }> {
        const response = await fetch(`${URL}persons`, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });
        return await response.json();
    }

    static async enroll(
        accessToken: TOKEN,
        engine: string,
        images: string[],
        personId: PERSON_ID,
    ): Promise<{ enrolled: boolean; stats?: STATISTICS }> {
        const response = await fetch(`${URL}enroll/${personId}?engine=${engine || 'iobroker'}&stats=true`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-type': 'application/json',
            },
            body: JSON.stringify(images),
        });
        return await response.json();
    }

    static async verify(
        accessToken: TOKEN,
        engine: string,
        images: string[],
        personId?: PERSON_ID,
    ): Promise<{
        error?: string;
        person?: PERSON_ID;
        // Results for each person
        results: { person: PERSON_ID; result: boolean; error?: string }[];
        // Errors for each image
        errors?: string[];
        stats?: STATISTICS;
    }> {
        if (personId) {
            const response = await fetch(`${URL}verify?person=${personId}&engine=${engine || 'iobroker'}`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-type': 'application/json',
                },
                body: JSON.stringify(images),
            });
            return await response.json();
        }

        const response = await fetch(`${URL}verify?engine=${engine || 'iobroker'}&stats=true`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-type': 'application/json',
            },
            body: JSON.stringify(images),
        });
        return await response.json();
    }

    static async edit(accessToken: TOKEN, personId: string, data: { id: PERSON_ID; name: string }): Promise<number> {
        const response = await fetch(`${URL}person/${personId}`, {
            method: 'PATCH',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-type': 'application/json',
            },
            body: JSON.stringify(data),
        });
        return (await response.json()).persons;
    }

    static async add(accessToken: TOKEN, personId: string, data: { name: string }): Promise<number> {
        const response = await fetch(`${URL}person/${personId}`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-type': 'application/json',
            },
            body: JSON.stringify(data),
        });
        return (await response.json()).persons;
    }

    static async updateAccessToken(refreshToken: TOKEN): Promise<{ access_token: TOKEN; refresh_token: TOKEN }> {
        const response = await fetch(`${URL}token`, {
            headers: {
                Authorization: `Bearer ${refreshToken}`,
            },
        });

        return await response.json();
    }

    static async token(login: string, password: string): Promise<{ access_token: TOKEN; refresh_token: TOKEN }> {
        const response = await fetch(`${URL}token`, {
            headers: {
                Authorization: `Basic ${btoa(`${login}:${password}`)}`,
            },
        });
        return await response.json();
    }
}
