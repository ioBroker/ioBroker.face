import React, { Component } from 'react';

import {
    IconButton,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    TextField,
    Table,
    TableRow,
    TableCell,
    TableHead,
    TableBody,
    Fab,
} from '@mui/material';

import { Check, Close, Delete, Person, Add } from '@mui/icons-material';

import { type AdminConnection, I18n } from '@iobroker/adapter-react-v5';

import type { FaceAdapterConfig } from '../types';
import { Camera } from '../components/Camera';
import { Comm } from '../components/Comm';

function validateToken(token: string): boolean {
    const payloadBase64 = token.split('.')[1];
    const base64 = payloadBase64.replace(/-/g, '+').replace(/_/g, '/');
    try {
        const decodedJwt = JSON.parse(window.atob(base64));
        if (decodedJwt.exp !== undefined) {
            return new Date(decodedJwt.exp * 1000).getTime() > Date.now();
        }
    } catch {
        // ignore
    }
    return false;
}

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

interface PersonsProps {
    alive: boolean;
    socket: AdminConnection;
    native: FaceAdapterConfig;
    common: ioBroker.InstanceCommon;
    instance: number;
    onChange: (attr: string, value: boolean | string) => void;
    showToast: (text: string) => void;
    onLoad: (native: Record<string, any>) => void;
}

interface PersonsState {
    showConfirmDialog: null | number;
    accessToken: string;
    refreshToken: string;
    showEnrollDialog: null | number;
    persons: { name: string; id: string; advancedId?: number }[];
    images: string[];
    showEditDialog: null | number;
    editItem: { name: string; id: string } | null;
}

class Persons extends Component<PersonsProps, PersonsState> {
    constructor(props: PersonsProps) {
        super(props);
        this.state = {
            showConfirmDialog: null,
            accessToken: '',
            refreshToken: '',
            persons: [],
            showEnrollDialog: null,
            images: [],
            editItem: null,
            showEditDialog: null,
        };
    }

    renderEnrollDialog(): React.JSX.Element | null {
        if (this.state.showEnrollDialog === null) {
            return null;
        }

        return (
            <Dialog
                open={!0}
                onClose={() => this.setState({ showEnrollDialog: null })}
                maxWidth="lg"
                fullWidth
            >
                <DialogTitle>
                    {I18n.t('Enroll person')}
                    <span style={{ fontWeight: 'bold' }}>
                        {this.state.persons[this.state.showEnrollDialog]
                            ? this.state.persons[this.state.showEnrollDialog].id
                            : this.state.editItem.id}
                    </span>
                </DialogTitle>
                <DialogContent>
                    <Camera
                        id="camera"
                        width={480}
                        height={640}
                    />
                </DialogContent>
                <DialogActions>
                    <Button
                        variant="contained"
                        color="primary"
                        onClick={async () => {
                            try {
                                const advancedId = await Comm.enroll(
                                    this.state.accessToken,
                                    this.props.native.engine || 'iobroker',
                                    this.state.persons[this.state.showEnrollDialog as number].id,
                                    this.state.images,
                                );
                                if (advancedId) {
                                    const persons = [...this.state.persons];
                                    persons[this.state.showEnrollDialog as number].advancedId = advancedId;
                                    this.setState({ persons });
                                }
                                this.setState({ showEnrollDialog: null });
                            } catch (e) {
                                this.props.showToast(`${I18n.t('Cannot enroll')}: ${e.toString()}`);
                            }
                        }}
                        startIcon={<Add />}
                    >
                        {I18n.t('Enroll')}
                    </Button>
                    <Button
                        variant="contained"
                        color="grey"
                        onClick={() => this.setState({ showEnrollDialog: null })}
                        startIcon={<Close />}
                    >
                        {I18n.t('Cancel')}
                    </Button>
                </DialogActions>
            </Dialog>
        );
    }

    renderEditDialog(): React.JSX.Element | null {
        if (this.state.showEditDialog === null) {
            return null;
        }

        let idError = '';
        if (!this.state.editItem!.id) {
            idError = I18n.t('Empty ID is not allowed');
        } else if (this.state.editItem!.id.length > 16) {
            idError = I18n.t('ID is too long. Max 16 characters');
        } else if (this.state.editItem!.id.match(/[^a-z0-9]+/)) {
            idError = I18n.t('Only lowercase a-z and digits are allowed');
        } else {
            for (let i = 0; i < this.state.persons.length; i++) {
                if (i === this.state.showEditDialog) {
                    continue;
                }
                if (this.state.persons[i].id === this.state.editItem!.id) {
                    idError = I18n.t('ID must be unique');
                    break;
                }
            }
        }

        return (
            <Dialog
                open={!0}
                onClose={() => this.setState({ showEditDialog: null })}
                maxWidth="lg"
                fullWidth
            >
                <DialogTitle>
                    {I18n.t('Edit person')}
                    <span style={{ fontWeight: 'bold' }}>{this.state.persons[this.state.showEditDialog].id}</span>
                </DialogTitle>
                <DialogContent>
                    <TextField
                        fullWidth
                        variant="standard"
                        label={I18n.t('ID')}
                        helperText={idError || I18n.t('Only a-z and 0-9 are allowed. Max 16 characters')}
                        error={!!idError}
                        value={this.state.editItem!.id}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>): void => {
                            const editItem: { id: string; name: string } = {
                                ...(this.state.editItem || { id: '', name: '' }),
                            };
                            editItem.id = e.target.value;
                            this.setState({ editItem });
                        }}
                    />
                    <TextField
                        fullWidth
                        variant="standard"
                        label={I18n.t('Name')}
                        helperText={I18n.t('Max 48 characters')}
                        error={this.state.editItem!.name.length > 48}
                        value={this.state.editItem!.name}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>): void => {
                            const editItem: { id: string; name: string } = {
                                ...(this.state.editItem || { id: '', name: '' }),
                            };
                            editItem.name = e.target.value;
                            this.setState({ editItem });
                        }}
                    />
                </DialogContent>
                <DialogActions>
                    <Button
                        variant="contained"
                        color="primary"
                        disabled={this.state.editItem!.name.length > 48 || !!idError}
                        onClick={async () => {
                            try {
                                await Comm.edit(
                                    this.state.accessToken,
                                    this.state.persons[this.state.showEditDialog as number].id,
                                    this.state.editItem!,
                                );
                                const persons = [...this.state.persons];
                                persons[this.state.showEditDialog as number] = this.state.editItem!;
                                this.setState({ persons, showEditDialog: null });
                            } catch (e) {
                                this.props.showToast(`${I18n.t('Cannot edit')}: ${e.toString()}`);
                            }
                        }}
                        startIcon={<Check />}
                    >
                        {I18n.t('Enroll')}
                    </Button>
                    <Button
                        variant="contained"
                        color="grey"
                        onClick={() => this.setState({ showEditDialog: null })}
                        startIcon={<Close />}
                    >
                        {I18n.t('Cancel')}
                    </Button>
                </DialogActions>
            </Dialog>
        );
    }

    renderConfirmDialog(): React.JSX.Element | null {
        if (this.state.showConfirmDialog === null) {
            return null;
        }

        return (
            <Dialog
                open={!0}
                onClose={() => this.setState({ showConfirmDialog: null })}
                maxWidth="md"
            >
                <DialogTitle>{I18n.t('Please confirm')}</DialogTitle>
                <DialogContent>
                    {I18n.t('Do you really want to delete "%s"', this.state.persons[this.state.showConfirmDialog])}
                </DialogContent>
                <DialogActions>
                    <Button
                        variant="contained"
                        color="grey"
                        onClick={async () => {
                            try {
                                const length = await Comm.deletePerson(
                                    this.state.accessToken,
                                    this.state.persons[this.state.showConfirmDialog as number].id,
                                );
                                if (length !== this.state.persons.length - 1) {
                                    await this.readPersons();
                                } else {
                                    const persons = [...this.state.persons];
                                    persons.splice(this.state.showConfirmDialog as number, 1);
                                    this.setState({ persons });
                                }
                            } catch (e) {
                                this.props.showToast(`${I18n.t('Cannot delete')}: ${e.toString()}`);
                            }
                        }}
                        startIcon={<Check />}
                    >
                        {I18n.t('Delete')}
                    </Button>
                    <Button
                        variant="contained"
                        color="primary"
                        onClick={() => this.setState({ showConfirmDialog: null })}
                        startIcon={<Close />}
                    >
                        {I18n.t('Cancel')}
                    </Button>
                </DialogActions>
            </Dialog>
        );
    }

    async componentDidMount(): Promise<void> {
        await this.readPersons();
        await this.props.socket.subscribeState(`face.${this.props.instance}.info.tokens`, this.onTokensChanged);
    }

    componentWillUnmount(): void {
        this.props.socket.unsubscribeState(`face.${this.props.instance}.info.tokens`);
    }

    async readPersons(): Promise<void> {
        await this.validateTokens();
        if (this.state.accessToken) {
            this.setState({ persons: await Comm.readPersons(this.state.accessToken) });
        }
    }

    onTokensChanged = (_id: string, state: ioBroker.State | null | undefined): void => {
        if (state?.val) {
            // try to parse
            try {
                const data = JSON.parse(state.val as string);
                if (
                    (data?.access_token || '') !== this.state.accessToken ||
                    (data?.refresh_token || '') !== this.state.refreshToken
                ) {
                    this.setState({ accessToken: data?.access_token || '', refreshToken: data?.refresh_token || '' });
                }
            } catch {
                if (this.state.accessToken || this.state.refreshToken) {
                    this.setState({ accessToken: '', refreshToken: '' });
                }
            }
        }
    };

    async setStateAsync(newState: Partial<PersonsState>): Promise<void> {
        return new Promise(resolve => this.setState(newState as PersonsState, () => resolve()));
    }

    async validateTokens(): Promise<void> {
        if (!this.state.accessToken) {
            const tokensVar = await this.props.socket.getState(`face.${this.props.instance}.info.tokens`);
            if (tokensVar?.val) {
                try {
                    const tokens: { access_token: string; refresh_token: string } = JSON.parse(tokensVar.val as string);
                    await this.setStateAsync({ accessToken: tokens.access_token, refreshToken: tokens.refresh_token });
                    if (this.state.accessToken) {
                        await this.validateTokens();
                    }
                    return;
                } catch {
                    // ignore
                }
            }
        }

        if (this.state.accessToken && validateToken(this.state.accessToken)) {
            return;
        }
        if (this.state.refreshToken && validateToken(this.state.refreshToken)) {
            try {
                // request new access token
                const tokens = await Comm.updateAccessToken(this.state.refreshToken);
                if (tokens.access_token && tokens.refresh_token) {
                    // save tokens
                    await this.props.socket.setState(
                        `face.${this.props.instance}.info.tokens`,
                        JSON.stringify(tokens),
                        true,
                    );
                    await this.setStateAsync({
                        accessToken: tokens?.access_token || '',
                        refreshToken: tokens?.refresh_token || '',
                    });
                    return;
                }
            } catch (e) {
                this.props.showToast(`${I18n.t('Cannot authenticate')}: ${e.toString()}`);
            }
        }

        if (this.props.native.login && this.props.native.password) {
            try {
                // Get token
                const tokens = await Comm.token(this.props.native.login, this.props.native.password);
                await this.setStateAsync({
                    accessToken: tokens?.access_token || '',
                    refreshToken: tokens?.refresh_token || '',
                });
                await this.props.socket.setState(
                    `face.${this.props.instance}.info.tokens`,
                    JSON.stringify(tokens),
                    true,
                );
            } catch (e) {
                this.props.showToast(`${I18n.t('Cannot authenticate')}: ${e.toString()}`);
                await this.setStateAsync({ accessToken: '', refreshToken: '' });
            }
        } else {
            this.props.showToast(`${I18n.t('Cannot authenticate')}: ${I18n.t('no login or password defined')}`);
            await this.setStateAsync({ accessToken: '', refreshToken: '' });
        }
    }

    renderPerson(index: number): React.JSX.Element {
        return (
            <TableRow key={index}>
                <TableCell>{index + 1}</TableCell>
                <TableCell
                    title={this.state.persons[index].advancedId ? I18n.t('Enrolled') : I18n.t('Must be enrolled')}
                    style={{ color: this.state.persons[index].advancedId ? 'green' : undefined }}
                >
                    {this.state.persons[index].id}
                </TableCell>
                <TableCell>{this.state.persons[index].name}</TableCell>
                <TableCell>
                    <IconButton
                        disabled={!this.state.accessToken}
                        onClick={() => this.setState({ showEnrollDialog: index, images: [] })}
                    >
                        <Person />
                    </IconButton>
                    <IconButton
                        disabled={!this.state.accessToken}
                        onClick={() =>
                            this.setState({ showEditDialog: index, editItem: { ...this.state.persons[index] } })
                        }
                    >
                        <Person />
                    </IconButton>
                    <IconButton
                        disabled={!this.state.accessToken}
                        onClick={() => this.setState({ showConfirmDialog: index })}
                    >
                        <Delete />
                    </IconButton>
                </TableCell>
            </TableRow>
        );
    }

    render(): React.JSX.Element {
        return (
            <div style={styles.panel}>
                {this.renderConfirmDialog()}
                {this.renderEnrollDialog()}
                {this.renderEditDialog()}
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell>
                                <Fab
                                    size="small"
                                    disabled={(this.state.persons?.length || 0) >= 10 || !this.state.accessToken}
                                    onClick={() =>
                                        this.setState({
                                            showEditDialog: this.state.persons.length,
                                            editItem: { id: '', name: '' },
                                        })
                                    }
                                >
                                    <Add />
                                </Fab>
                            </TableCell>
                            <TableCell>{I18n.t('ID')}</TableCell>
                            <TableCell>{I18n.t('Name')}</TableCell>
                            <TableCell></TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>{this.state.persons.map((person, i) => this.renderPerson(i))}</TableBody>
                </Table>
            </div>
        );
    }
}

export default Persons;
