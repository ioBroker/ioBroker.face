import { Adapter, type AdapterOptions } from '@iobroker/adapter-core';
import type { FaceAdapterConfig } from './types';
import { Comm } from './lib/comm';
import { decode } from 'jsonwebtoken';
import axios, { AxiosError } from 'axios';

function getAttr(obj: Record<string, any>, path: string): any {
    const parts = path.split('.');
    let result = obj;
    try {
        for (const part of parts) {
            if (result[part] === undefined) {
                return undefined;
            }
            result = result[part];
        }
    } catch {
        return undefined;
    }

    return result;
}

export class FaceAdapter extends Adapter {
    private readonly faceConfig: FaceAdapterConfig;
    private accessToken: string | null = null;
    private refreshToken: string | null = null;
    private images: { dataUrl: string; ts: number }[] = [];
    private garbageCollector: NodeJS.Timeout | null = null;

    public constructor(options: Partial<AdapterOptions> = {}) {
        super({
            ...options,
            name: 'face',
        });

        this.faceConfig = this.config as FaceAdapterConfig;

        this.on('ready', () => this.#onReady());
        this.on('stateChange', (id, state) => this.#onStateChange(id, state));
        this.on('message', this.#onMessage.bind(this));
        this.on('unload', this.#onUnload.bind(this));
    }

    async #onUnload(callback: () => void): Promise<void> {
        if (this.garbageCollector) {
            clearInterval(this.garbageCollector);
            this.garbageCollector = null;
        }
        try {
            await this.setState('images.upload', '', true);
            await this.setState('images.uploaded', 0, true);
            await this.setState('images.verify', false, true);
            await this.setState('images.enroll', '', true);
            await this.setState('images.lastResult', '', true);
            callback();
        } catch {
            callback();
        }
    }

    async readPersons(): Promise<void> {
        if (await this.validateTokens()) {
            const cloudPersons = await Comm.readPersons(this.accessToken!);
            if (cloudPersons) {
                // sync configuration
                const localPersons = await this.getObjectViewAsync('system', 'state', {
                    startkey: `${this.namespace}.persons.`,
                    endkey: `${this.namespace}.persons.\u9999`,
                });

                for (const localPerson of localPersons.rows) {
                    // check if this person still exist
                    const personId = localPerson.value._id.split('.').pop();
                    if (personId) {
                        const person = cloudPersons.find(p => p.id === personId);
                        if (person) {
                            // Check if the name is still the same
                            if (person.name !== localPerson.value.common.name) {
                                localPerson.value.common.name = person.name;
                                await this.setForeignObject(localPerson.value._id, localPerson.value);
                            }
                        } else {
                            await this.delForeignObjectAsync(localPerson.value._id);
                        }
                    } else {
                        await this.delForeignObjectAsync(localPerson.value._id);
                    }
                }

                // create new
                for (const cloudPerson of cloudPersons) {
                    if (!localPersons.rows.find(lp => lp.value._id.endsWith(`.${cloudPerson.id}`))) {
                        // create this person
                        await this.setObject(`persons.${cloudPerson.id}`, {
                            _id: `persons.${cloudPerson.id}`,
                            common: {
                                read: true,
                                write: false,
                                name: cloudPerson.name,
                                role: 'state',
                                type: 'boolean',
                                def: false,
                            },
                            type: 'state',
                            native: {},
                        });
                    }
                }
            }
        }
    }

    async #onReady(): Promise<void> {
        // Reset image interface
        await this.setState('images.upload', '', true);
        await this.setState('images.uploaded', 0, true);
        await this.setState('images.verify', false, true);
        await this.setState('images.enroll', '', true);
        await this.setState('images.lastResult', '', true);

        // Subscribe on tokens change
        await this.subscribeStatesAsync('info.tokens');
        await this.subscribeStatesAsync('images.*');
    }

    async #onStateChange(id: string, state: ioBroker.State | null | undefined): Promise<void> {
        if (id === `${this.namespace}.info.tokens`) {
            if (state?.val) {
                try {
                    const tokens = JSON.parse(state.val as string);
                    this.accessToken = tokens.access_token || null;
                    this.refreshToken = tokens.refresh_token || null;
                } catch {
                    this.accessToken = null;
                    this.refreshToken = null;
                }
            } else {
                this.accessToken = null;
                this.refreshToken = null;
            }
        } else if (id === `${this.namespace}.images.upload`) {
            // Save image
            if (state?.val) {
                const image = await this.readURL(state.val as string);
                if (image) {
                    await this.doGarbageCollect(true);
                    this.images.push({ dataUrl: image, ts: Date.now() });
                    this.images = this.images.slice(-4);
                    await this.setState('images.upload', '', true);
                    await this.setState('images.uploaded', this.images.length, true);
                    this.updateGarbageCollector();
                }
            }
        } else if (id === `${this.namespace}.images.verify`) {
            if (state?.val && !state.ack) {
                await this.doGarbageCollect();
                if (this.images.length) {
                    if (await this.validateTokens()) {
                        try {
                            const result = await Comm.verify(
                                this.accessToken!,
                                this.faceConfig.engine || 'iobroker',
                                this.images.map(img => img.dataUrl),
                            );
                            if (result.person) {
                                this.log.debug(`Person verified: ${result.person}`);
                                await this.setState(`persons.${result.person}`, true, false);
                            } else {
                                this.log.debug(`Person was not identified`);
                            }
                            await this.setState('images.lastResult', result.person || '<no person>', true);
                        } catch (e) {
                            this.log.error(`Cannot verify images: ${e.toString()}`);
                            await this.setState('images.lastResult', `<${e.toString()}>`, true);
                        }
                    } else {
                        this.log.error(`Cannot authenticate`);
                        await this.setState('images.lastResult', '<authentication error>', true);
                    }
                    this.images = [];
                    await this.setState('images.uploaded', 0, true);
                    this.updateGarbageCollector();
                } else {
                    this.log.error(`No images to verify`);
                    await this.setState('images.lastResult', '<no images>', true);
                }
            }
        } else if (id === `${this.namespace}.images.enroll`) {
            if (state?.val && !state.ack) {
                // Check that person exists
                const personId = state.val as string;
                const person = await this.getObjectAsync(`persons.${personId}`);
                if (person) {
                    await this.doGarbageCollect();
                    if (this.images.length) {
                        if (await this.validateTokens()) {
                            try {
                                const result = await Comm.enroll(
                                    this.accessToken!,
                                    this.faceConfig.engine || 'iobroker',
                                    this.images.map(img => img.dataUrl),
                                    personId,
                                );

                                this.log.debug(`Result of enrollment: ${result.enrolled}`);

                                await this.setState(
                                    'images.lastResult',
                                    result.enrolled ? `[${personId}]` : '<cannot enroll>',
                                    true,
                                );
                            } catch (e) {
                                this.log.error(`Cannot verify images: ${e.toString()}`);
                                await this.setState('images.lastResult', `<${e.toString()}>`, true);
                            }
                        } else {
                            this.log.error(`Cannot authenticate`);
                            await this.setState('images.lastResult', '<authentication error>', true);
                        }
                        this.images = [];
                        await this.setState('images.uploaded', 0, true);
                        this.updateGarbageCollector();
                    } else {
                        this.log.error(`No images to enroll`);
                        await this.setState('images.lastResult', '<no images>', true);
                    }
                } else {
                    this.log.error(`Person ${personId} not found`);
                    await this.setState('images.lastResult', '<person not found>', true);
                }
            }
        }
    }

    async readURL(url: string, redirects?: string[]): Promise<string | null> {
        redirects = redirects || [];
        if (url.startsWith('data:image/')) {
            return url;
        }
        if (redirects.length > 4) {
            this.log.error(`Too many redirects: ${redirects.join(' -> ')}`);
            return null;
        }

        if (url.startsWith('http://') || url.startsWith('https://')) {
            try {
                const response = await axios.get(url, { responseType: 'arraybuffer' });
                return `data:image/jpeg;base64,${Buffer.from(response.data).toString('base64')}`;
            } catch (e: unknown) {
                if (e instanceof AxiosError) {
                    this.log.error(`Cannot load image: ${e.response?.statusText}`);
                } else {
                    this.log.error(`Cannot load image: ${(e as Error).toString()}`);
                }
            }
            return null;
        }
        if (url.startsWith('iobstate://')) {
            const parts = url.split('://');
            if (parts.length === 2) {
                const [id] = parts[1].split('/'); // remove attribute
                const state = await this.getStateAsync(id);
                if (state?.val && typeof state.val === 'string') {
                    redirects.push(url);
                    return this.readURL(state.val, redirects);
                }
            } else {
                this.log.error(`Invalid IOB url: ${url}`);
            }
            return null;
        }

        if (url.startsWith('iobobject://')) {
            // iobobject://system.adapter.admin/native.schemas.specificObject
            const parts = url.split('://');
            if (parts.length === 2) {
                const [id, path] = parts[1].split('/'); // read path
                if (path) {
                    const obj = await this.getObjectAsync(id);
                    if (obj) {
                        const value = getAttr(obj, path);
                        if (typeof value === 'string') {
                            redirects.push(url);
                            return this.readURL(value, redirects);
                        }
                    } else {
                        this.log.error(`Cannot read object: ${id}`);
                    }
                } else {
                    this.log.error(`Invalid IOB url: ${url}`);
                }
            }
            return null;
        }

        return null;
    }

    async doGarbageCollect(noUpdate?: boolean): Promise<void> {
        const now = Date.now();
        const before = this.images.length;
        this.images = this.images.filter(img => now - img.ts < 15000);
        if (before !== this.images.length && !noUpdate) {
            await this.setState('images.uploaded', this.images.length, true);
        }

        if (!noUpdate && !this.images.length && this.garbageCollector) {
            clearInterval(this.garbageCollector);
            this.garbageCollector = null;
        }
    }

    updateGarbageCollector(): void {
        if (this.images.length) {
            if (!this.garbageCollector) {
                this.garbageCollector = setInterval(() => this.doGarbageCollect(), 5000);
            }
        } else if (this.garbageCollector) {
            clearInterval(this.garbageCollector);
            this.garbageCollector = null;
        }
    }

    static validateToken(token: string): boolean {
        try {
            const decodedJwt = decode(token);
            if (typeof decodedJwt === 'object' && decodedJwt?.exp !== undefined) {
                return new Date(decodedJwt.exp * 1000).getTime() > Date.now();
            }
        } catch {
            // ignore
        }
        return false;
    }

    async validateTokens(): Promise<boolean> {
        if (!this.accessToken) {
            const tokensVar = await this.getStateAsync('info.tokens');
            if (tokensVar?.val) {
                try {
                    const tokens: { access_token: string; refresh_token: string } = JSON.parse(tokensVar.val as string);
                    this.accessToken = tokens.access_token || null;
                    this.refreshToken = tokens.refresh_token || null;
                    if (this.accessToken) {
                        return await this.validateTokens();
                    }
                } catch {
                    // ignore
                }
            }
        }

        if (this.accessToken && FaceAdapter.validateToken(this.accessToken)) {
            return true;
        }
        if (this.refreshToken && FaceAdapter.validateToken(this.refreshToken)) {
            try {
                // request new access token
                const tokens = await Comm.updateAccessToken(this.refreshToken);
                if (tokens?.access_token && tokens?.refresh_token) {
                    // save tokens
                    await this.setState('info.tokens', JSON.stringify(tokens), true);
                    this.accessToken = tokens.access_token || null;
                    this.refreshToken = tokens.refresh_token || null;
                    return true;
                }
            } catch (e) {
                this.log.error(`Cannot authenticate: ${e.toString()}`);
            }
        }

        if (this.faceConfig.login && this.faceConfig.password) {
            try {
                // Get token
                const tokens = await Comm.token(this.faceConfig.login, this.faceConfig.password);
                this.accessToken = tokens?.access_token || null;
                this.refreshToken = tokens?.refresh_token || null;
                await this.setState('info.tokens', JSON.stringify(tokens), true);
            } catch (e) {
                this.log.error(`Cannot authenticate: ${e.toString()}`);
                this.accessToken = null;
                this.refreshToken = null;
            }
        } else {
            this.log.error(`Cannot authenticate: no login or password defined`);
            this.accessToken = null;
            this.refreshToken = null;
        }
        return !!this.accessToken;
    }

    async #onMessage(msg: ioBroker.Message): Promise<void> {
        if (msg?.command === 'sync') {
            await this.readPersons();
            if (msg.callback) {
                this.sendTo(msg.from, msg.command, { result: 'done' }, msg.callback);
            }
        } else if (msg?.command === 'validate') {
            if (!msg.message) {
                this.sendTo(msg.from, msg.command, { error: 'No images found' }, msg.callback);
                return;
            }
            let message: { images: string[]; person?: string } = msg.message;
            if (Array.isArray(msg.message)) {
                message = { images: msg.message };
            } else if (typeof msg.message === 'string') {
                message = { images: [msg.message] };
            }
            if (!message.images.length) {
                this.sendTo(msg.from, msg.command, { error: 'No images found' }, msg.callback);
                return;
            }
            if (await this.validateTokens()) {
                const result = await Comm.verify(
                    this.accessToken!,
                    this.faceConfig.engine || 'iobroker',
                    message.images,
                    message.person,
                );
                if (result.person) {
                    await this.setState(`persons.${result.person}`, true, false);
                }
                this.sendTo(msg.from, msg.command, result, msg.callback);
            } else {
                this.sendTo(msg.from, msg.command, { error: 'Cannot authenticate' }, msg.callback);
            }
        } else {
            this.log.warn(`Unknown command: ${msg.command}`);
        }
    }
}

if (require.main !== module) {
    // Export the constructor in compact mode
    module.exports = (options: Partial<AdapterOptions> | undefined) => new FaceAdapter(options);
} else {
    // otherwise start the instance directly
    (() => new FaceAdapter())();
}
