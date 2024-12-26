import axios from 'axios';
import type { ENGINE, PERSON_ID, TOKEN } from '../../src-admin/src/types';
const URL = 'https://face.iobroker.in/';

export type STATISTICS = {
    usage: Record<ENGINE, { monthly: number; daily: number; lastTime: number }>;
    limits: Record<ENGINE, { daily: number; monthly: number }>;
    licenseTill: number;
};

export class Comm {
    static async deletePerson(accessToken: string, personId: string): Promise<number> {
        const response = await axios.delete(`${URL}person/${personId}`, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });
        return response.data.persons;
    }

    static async readPersons(accessToken: string): Promise<{
        persons: {
            name: string;
            id: PERSON_ID;
            iobroker?: { enrolled: boolean; monthly: number; daily: number; lastTime: number };
            advanced?: { enrolled: boolean; monthly: number; daily: number; lastTime: number };
        }[];
        stats: STATISTICS;
    }> {
        const response = await axios.get(`${URL}persons`, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });
        return response.data;
    }

    static async enroll(
        accessToken: string,
        engine: string,
        images: string[],
        personId: string,
    ): Promise<{ enrolled: boolean; stats?: STATISTICS }> {
        const response = await axios.post(`${URL}enroll/${personId}?engine=${engine || 'iobroker'}`, images, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-type': 'application/json',
            },
        });
        return response.data.advancedId;
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
