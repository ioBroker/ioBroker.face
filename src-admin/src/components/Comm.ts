import { I18n } from '@iobroker/adapter-react-v5';

const URL = 'https://face.iobroker.in/';

export class Comm {
    static async deletePerson(accessToken: string, personId: string): Promise<number> {
        const response = await fetch(`${URL}person/${personId}`, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
            method: 'DELETE',
        });
        const data: { persons: number } = await response.json();
        return data.persons;
    }

    static async readPersons(accessToken: string): Promise<{ name: string; id: string; advancedId?: number }[]> {
        const response = await fetch(`${URL}persons`, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });
        const data: { persons: { name: string; id: string; advancedId?: number }[] } = await response.json();
        return data.persons;
    }

    static async enroll(accessToken: string, engine: string, personId: string, images: string[]): Promise<number> {
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

    static async edit(accessToken: string, personId: string, data: { id: string; name: string }): Promise<void> {
        await fetch(`${URL}person/${personId}`, {
            method: 'PATCH',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-type': 'application/json',
            },
            body: JSON.stringify(data),
        });
    }

    static async updateAccessToken(refreshToken: string): Promise<{ access_token: string; refresh_token: string }> {
        const response = await fetch(`${URL}token`, {
            headers: {
                Authorization: `Bearer ${refreshToken}`,
            },
        });

        return await response.json();
    }

    static async token(login: string, password: string): Promise<{ access_token: string; refresh_token: string }> {
        const response = await fetch(`${URL}token`, {
            headers: {
                Authorization: `Basic ${btoa(`${login}:${password}`)}`,
            },
        });
        return await response.json();
    }
}
