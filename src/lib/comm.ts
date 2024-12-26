import axios from 'axios';
const URL = 'https://face.iobroker.in/';

export class Comm {
    static async deletePerson(accessToken: string, personId: string): Promise<number> {
        const response = await axios.delete(`${URL}person/${personId}`, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });
        return response.data.persons;
    }

    static async readPersons(accessToken: string): Promise<{ name: string; id: string; advancedId?: number }[]> {
        const response = await axios.get(`${URL}persons`, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });
        return response.data.persons;
    }

    static async enroll(accessToken: string, engine: string, personId: string, images: string[]): Promise<number> {
        const response = await axios.post(`${URL}enroll/${personId}?engine=${engine || 'iobroker'}`, images, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-type': 'application/json',
            },
        });
        return response.data.advancedId;
    }

    static async edit(accessToken: string, personId: string, data: { id: string; name: string }): Promise<void> {
        await axios.patch(`${URL}person/${personId}`, data, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-type': 'application/json',
            },
        });
    }

    static async updateAccessToken(refreshToken: string): Promise<{ access_token: string; refresh_token: string }> {
        const response = await axios.get(`${URL}token`, {
            headers: {
                Authorization: `Bearer ${refreshToken}`,
            },
        });

        return response.data;
    }

    static async token(login: string, password: string): Promise<{ access_token: string; refresh_token: string }> {
        const response = await axios.get(`${URL}token`, {
            headers: {
                Authorization: `Basic ${btoa(`${login}:${password}`)}`,
            },
        });
        return response.data;
    }
}
