import type { PERSON_ID, TOKEN } from '../types';
const URL = 'https://face.iobroker.in/';

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

    static async readPersons(accessToken: TOKEN): Promise<{ name: string; id: PERSON_ID; advancedId?: number }[]> {
        const response = await fetch(`${URL}persons`, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });
        const data: { persons: { name: string; id: PERSON_ID; advanced?: boolean; iobroker?: boolean }[] } =
            await response.json();
        return data.persons;
    }

    static async enroll(accessToken: TOKEN, engine: string, personId: PERSON_ID, images: string[]): Promise<number> {
        const response = await fetch(`${URL}enroll/${personId}?engine=${engine || 'iobroker'}`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-type': 'application/json',
            },
            body: JSON.stringify(images),
        });
        return (await response.json()).advancedId;
    }

    static async verify(
        accessToken: TOKEN,
        engine: string,
        images: string[],
        personId?: PERSON_ID,
    ): Promise<{ person: PERSON_ID; results: { person: PERSON_ID; result: boolean; error?: string }[] }> {
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

        const response = await fetch(`${URL}verify?engine=${engine || 'iobroker'}`, {
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
