import React, { Component } from 'react';
import {
    Button,
    Checkbox,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControlLabel,
} from '@mui/material';
import { Add, Close, Person, PhotoCameraFront } from '@mui/icons-material';

import { I18n, type ThemeType } from '@iobroker/adapter-react-v5';

import { Camera } from './Camera';

interface ScanDialogProps {
    onClose: (images?: string[]) => void;
    processing: boolean;
    title: string | React.JSX.Element;
    themeType: ThemeType;
    numberOfSnapshots: number;
    verifyAllPersons?: boolean;
    onVerifyAllPersonsChanged?: (verifyAllPersons: boolean) => void;
    buttonText?: string;
}

interface ScanDialogState {
    images: string[];
    iframe: WindowProxy | null;
}

export default class ScanDialog extends Component<ScanDialogProps, ScanDialogState> {
    private initInterval: ReturnType<typeof setInterval> | null = null;

    private readonly showCloud = window.location.protocol !== 'https:' && window.location.hostname !== 'localhost';

    constructor(props: ScanDialogProps) {
        super(props);
        this.state = {
            images: [],
            iframe: null,
        };
    }

    componentDidMount(): void {
        window.addEventListener('message', this.onMessage);
    }

    componentWillUnmount(): void {
        window.removeEventListener('message', this.onMessage);
        if (this.initInterval) {
            clearInterval(this.initInterval);
            this.initInterval = null;
        }
    }

    onMessage = (event: { origin: string; data: any }): void => {
        if (typeof event.data === 'string') {
            if (event.origin === 'https://qr-code.iobroker.in') {
                if (event.data === 'inited') {
                    if (this.initInterval) {
                        clearInterval(this.initInterval);
                        this.initInterval = null;
                    }
                } else if (event.data === 'closeMe') {
                    this.state.iframe?.close();
                    this.setState({ iframe: null });
                } else {
                    try {
                        const images: string[] = JSON.parse(event.data);

                        this.setState({ images });
                        if (images.length >= this.props.numberOfSnapshots) {
                            this.state.iframe?.postMessage(
                                `close:${I18n.t('ioBroker received "%s" images. You can now close this window', images.length)}`,
                                '*',
                            );
                        }
                    } catch {
                        console.error(`Cannot parse images: ${event.data}`);
                    }
                }
            }
        }
    };

    renderImage(index: number): React.JSX.Element {
        return (
            <div
                key={index}
                style={{ position: 'relative', height: 180, borderRadius: 5, width: 135 }}
            >
                <img
                    style={{ width: 'auto', height: '100%' }}
                    key={index}
                    src={this.state.images[index]}
                    alt="screenshot"
                />
            </div>
        );
    }

    renderImages(): React.JSX.Element {
        const result = [];
        for (let i = 0; i < this.props.numberOfSnapshots; i++) {
            if (i < this.state.images.length) {
                result.push(this.renderImage(i));
            } else {
                break;
            }
        }
        for (let i = this.state.images.length; i < this.props.numberOfSnapshots; i++) {
            result.push(
                <div
                    key={i}
                    style={{
                        position: 'relative',
                        height: 180,
                        borderRadius: 5,
                        width: 135,
                        border: '1px dashed #888',
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                    }}
                >
                    <Person style={{ width: 130, height: 130, color: '#888' }} />
                </div>,
            );
        }

        return (
            <div style={{ width: 290, display: 'flex', flexWrap: 'wrap', marginTop: 10, padding: 16, gap: 8 }}>
                {result}
            </div>
        );
    }

    render(): React.JSX.Element {
        return (
            <Dialog
                open={!0}
                onClose={() => this.props.onClose()}
                maxWidth={this.showCloud ? 'sm' : 'lg'}
                fullWidth={!this.showCloud}
            >
                <DialogTitle>{this.props.title}</DialogTitle>
                <DialogContent style={{ textAlign: 'center' }}>
                    {!this.showCloud ? (
                        <Camera
                            id="camera"
                            width={480}
                            height={640}
                            disabled={this.props.processing}
                            numberOfSnapshots={this.props.numberOfSnapshots}
                            verifyAllPersons={this.props.verifyAllPersons}
                            onVerifyAllPersonsChanged={this.props.onVerifyAllPersonsChanged}
                            onImagesUpdate={(images: string[]): void => {
                                this.setState({ images });
                            }}
                        />
                    ) : (
                        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            {this.props.onVerifyAllPersonsChanged ? (
                                <FormControlLabel
                                    style={{ marginLeft: 16 }}
                                    control={
                                        <Checkbox
                                            disabled={this.props.processing}
                                            checked={this.props.verifyAllPersons}
                                            onChange={() =>
                                                this.props.onVerifyAllPersonsChanged!(!this.props.verifyAllPersons)
                                            }
                                        />
                                    }
                                    label={I18n.t('Check all persons')}
                                />
                            ) : null}
                            <Button
                                style={{ marginTop: 16 }}
                                variant="contained"
                                onClick={() => {
                                    const iframe = window.open(
                                        `https://qr-code.iobroker.in/face/index.html?theme=${this.props.themeType}&snapshots=${this.props.numberOfSnapshots}&text=${encodeURIComponent(this.props.buttonText || I18n.t('Enroll'))}`,
                                        '_blank',
                                    );
                                    this.setState({ iframe }, () => {
                                        if (this.state.iframe && !this.initInterval) {
                                            this.initInterval = setInterval(() => {
                                                this.state.iframe?.postMessage('init', '*');
                                            }, 300);
                                        }
                                    });
                                }}
                                startIcon={<PhotoCameraFront />}
                            >
                                {I18n.t('Take photos with the ioBroker cloud')}
                            </Button>
                            {this.renderImages()}
                        </div>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button
                        variant="contained"
                        color="primary"
                        disabled={!this.state.images.length || this.props.processing}
                        onClick={() => this.props.onClose(this.state.images)}
                        startIcon={this.props.processing ? <CircularProgress size={20} /> : <Add />}
                    >
                        {this.props.buttonText || I18n.t('Enroll')}
                    </Button>
                    <Button
                        variant="contained"
                        disabled={this.props.processing}
                        color="grey"
                        onClick={() => this.props.onClose()}
                        startIcon={<Close />}
                    >
                        {I18n.t('Cancel')}
                    </Button>
                </DialogActions>
            </Dialog>
        );
    }
}
