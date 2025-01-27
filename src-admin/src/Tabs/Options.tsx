import React, { Component } from 'react';

import { Button, FormControl, InputLabel, MenuItem, Select, TextField, Typography } from '@mui/material';

import { type AdminConnection, I18n, Logo } from '@iobroker/adapter-react-v5';

import { InfoBox } from '@foxriver76/iob-component-lib';
import type { FaceAdapterConfig } from '../types';

const styles: Record<string, React.CSSProperties> = {
    address: {
        fontSize: 'smaller',
        opacity: 0.5,
        marginLeft: 8,
    },
    panel: {
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
    },
    input: {
        marginTop: 2,
        marginBottom: 1,
        width: '100%',
        maxWidth: 500,
    },
    inputLong: {
        marginTop: 2,
        marginBottom: 1,
        width: '100%',
        maxWidth: 500,
    },
    header: {
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 1,
    },
};

interface OptionsProps {
    alive: boolean;
    socket: AdminConnection;
    native: FaceAdapterConfig;
    common: ioBroker.InstanceCommon;
    instance: number;
    onChange: (attr: string, value: boolean | string, cb?: () => void) => void;
    showToast: (text: string) => void;
    onLoad: (native: Record<string, any>) => void;
}

interface OptionsState {
    iotLogin: string;
    iotPassword: string;
    iotInstance: string;
}

class Options extends Component<OptionsProps, OptionsState> {
    private clearTimer: ReturnType<typeof setTimeout> | null = null;

    constructor(props: OptionsProps) {
        super(props);
        this.state = {
            iotLogin: '',
            iotPassword: '',
            iotInstance: '',
        };
    }

    static checkPassword(password: string): string | false {
        password = (password || '').toString();
        if (password.length < 8 || !password.match(/[a-z]/) || !password.match(/[A-Z]/) || !password.match(/\d/)) {
            return I18n.t('invalid_password_warning');
        }
        return false;
    }

    async componentDidMount(): Promise<void> {
        // detect if any iot or cloud with pro-account are available
        const instancesIot = await this.props.socket.getAdapterInstances('iot');
        let instance: ioBroker.InstanceObject | null = null;
        if (instancesIot) {
            instance = instancesIot.find(it => it?.native?.login && it?.native?.pass) || null;
            if (instance) {
                // encode
                const pass = await this.props.socket.decrypt(instance.native.pass);

                this.setState({
                    iotInstance: instance._id,
                    iotPassword: pass,
                    iotLogin: instance.native.login,
                });
            }
        }

        if (!instance) {
            const instancesCloud = await this.props.socket.getAdapterInstances('cloud');
            instance = instancesCloud.find(it => it?.native?.login && it?.native?.pass) || null;
            if (instance) {
                // encode
                const pass = await this.props.socket.decrypt(instance.native.pass);

                this.setState({
                    iotInstance: instance._id,
                    iotPassword: pass,
                    iotLogin: instance.native.login,
                });
            }
        }
    }

    componentWillUnmount(): void {
        if (this.clearTimer) {
            clearTimeout(this.clearTimer);
            void this.props.socket.setState(`face.${this.props.instance}.info.tokens`, '', true);
        }
    }

    clearTokens(): void {
        if (this.clearTimer) {
            clearTimeout(this.clearTimer);
        }

        this.clearTimer = setTimeout(() => {
            this.clearTimer = null;
            void this.props.socket.setState(`face.${this.props.instance}.info.tokens`, '', true);
        }, 500);
    }

    render(): React.JSX.Element {
        const passwordError = Options.checkPassword(this.props.native.password);

        return (
            <div style={styles.panel}>
                <Logo
                    instance={this.props.instance}
                    common={this.props.common}
                    native={this.props.native}
                    onError={text => this.props.showToast(text)}
                    onLoad={this.props.onLoad}
                />
                <FormControl style={styles.inputLong}>
                    <InputLabel>{I18n.t('Face detection engine')}</InputLabel>
                    <Select
                        variant="standard"
                        style={styles.inputLong}
                        value={this.props.native.engine || '_'}
                        onChange={e => this.props.onChange('engine', e.target.value)}
                    >
                        <MenuItem value="iobroker">ioBroker</MenuItem>
                        <MenuItem value="advanced">{I18n.t('Advanced')}</MenuItem>
                    </Select>
                </FormControl>
                <div style={{ marginTop: 50 }}>
                    <Typography sx={styles.header}>{I18n.t('Cloud Account')}</Typography>
                    <InfoBox type="info">
                        {I18n.t(
                            'To use a Face detection please enter valid ioBroker.pro Cloud credentials with at least an active Assistant license.',
                        )}
                    </InfoBox>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline' }}>
                    <TextField
                        variant="standard"
                        label={I18n.t('ioBroker.pro Login')}
                        value={this.props.native.login}
                        type="text"
                        slotProps={{
                            input: {
                                autoComplete: 'new-password',
                            },
                            htmlInput: {
                                autoComplete: 'new-password',
                                form: { autoComplete: 'off' },
                            },
                        }}
                        onChange={e => {
                            this.props.onChange('login', e.target.value);
                            void this.clearTokens();
                        }}
                        margin="normal"
                        style={{ ...styles.input, marginRight: 16 }}
                    />
                    <TextField
                        variant="standard"
                        label={I18n.t('ioBroker.pro Password')}
                        error={!!passwordError}
                        autoComplete="current-password"
                        style={styles.input}
                        value={this.props.native.password}
                        type="password"
                        slotProps={{
                            input: {
                                autoComplete: 'new-password',
                            },
                            htmlInput: {
                                autoComplete: 'new-password',
                                form: { autoComplete: 'off' },
                            },
                        }}
                        helperText={passwordError || ''}
                        onChange={e => {
                            this.props.onChange('password', e.target.value);
                            void this.clearTokens();
                        }}
                        margin="normal"
                    />
                    {this.state.iotInstance &&
                    (this.state.iotPassword !== this.props.native.password ||
                        this.state.iotLogin !== this.props.native.login) ? (
                        <Button
                            style={{ marginLeft: 16 }}
                            variant="contained"
                            color="primary"
                            onClick={() => {
                                if (
                                    this.props.native.login !== this.state.iotLogin ||
                                    this.props.native.password !== this.state.iotPassword
                                ) {
                                    this.props.onChange('login', this.state.iotLogin, () => {
                                        this.props.onChange('password', this.state.iotPassword);
                                        void this.clearTokens();
                                    });
                                }
                            }}
                        >
                            {I18n.t('Sync credentials with %s', this.state.iotInstance.replace('system.adapter.', ''))}
                        </Button>
                    ) : null}
                </div>
            </div>
        );
    }
}

export default Options;
