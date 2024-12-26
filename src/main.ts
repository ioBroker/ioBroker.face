import { Adapter, type AdapterOptions } from '@iobroker/adapter-core';
import type { FaceAdapterConfig } from './types';
import { Comm } from './lib/comm';
import { decode } from 'jsonwebtoken';

export class FaceAdapter extends Adapter {
    private readonly faceConfig: FaceAdapterConfig;
    private accessToken: string | null = null;
    private refreshToken: string | null = null;

    public constructor(options: Partial<AdapterOptions> = {}) {
        super({
            ...options,
            name: 'face',
        });

        this.faceConfig = this.config as FaceAdapterConfig;

        this.on('ready', () => this.#onReady());
        this.on('stateChange', (id, state) => this.#onStateChange(id, state));
        this.on('message', this.#onMessage.bind(this));
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
        // Subscribe on tokens change
        await this.subscribeStatesAsync('info.tokens');
    }

    #onStateChange(id: string, state: ioBroker.State | null | undefined): void {
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
            // todo
            this.sendTo(msg.from, msg.command, { result: 'unknown' }, msg.callback);
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
