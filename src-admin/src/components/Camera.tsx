import React from 'react';
import * as faceapi from 'face-api.js';

import { Button, IconButton, MenuItem, Select, Checkbox, FormControlLabel } from '@mui/material';
import { Delete, FiberManualRecord, Stop } from '@mui/icons-material';

import { I18n } from '@iobroker/adapter-react-v5';
import type { FaceDetection } from 'face-api.js/build/commonjs/classes/FaceDetection';
import type { FaceLandmarks68 } from 'face-api.js/build/commonjs/classes/FaceLandmarks68';

function getTop(l: { x: number; y: number }[]): number {
    return l.map(a => a.y).reduce((a, b) => Math.min(a, b));
}

function getMeanPosition(l: { x: number; y: number }[]): [number, number] {
    const p = { x: l[0].x, y: l[0].y };
    for (let i = 1; i < l.length; i++) {
        p.x += l[i].x;
        p.y += l[i].y;
    }
    p.x /= l.length;
    p.y /= l.length;
    return [p.x, p.y];
}

interface CameraProps {
    width: number;
    height: number;
    id: string;
    onImagesUpdate: (images: string[]) => void;
    disabled?: boolean;
    verifyAllPersons?: boolean;
    onVerifyAllPersonsChanged?: (verifyAllPersons: boolean) => void;
    numberOfSnapshots: number;
}

interface CameraState {
    images: string[];
    selectedCamera: string;
    cameras: MediaDeviceInfo[] | null;
    oneFaceDetected: boolean;
    takingSnapshots: boolean;
}

export class Camera extends React.Component<CameraProps, CameraState> {
    private readonly refVideo: React.RefObject<HTMLVideoElement>;
    private readonly refCanvas: React.RefObject<HTMLCanvasElement>;
    private readonly refOverlay: React.RefObject<HTMLDivElement>;
    private readonly refOverlayFrame: React.RefObject<HTMLDivElement>;
    private readonly refInnerCanvas: React.RefObject<HTMLCanvasElement>;
    private readonly refResultsCanvas: React.RefObject<HTMLCanvasElement>;
    private readonly refInstructions: React.RefObject<HTMLDivElement>;
    private context2: CanvasRenderingContext2D | null = null;
    private initialized = '';
    private detectionTimeout: ReturnType<typeof setTimeout> | null = null;
    private lastMovement: { angle: number; ts: number } = { angle: 0, ts: 0 };
    private modelLoaded: Promise<void[]> | null = null;

    constructor(props: CameraProps) {
        super(props);
        this.refVideo = React.createRef();
        this.refCanvas = React.createRef();
        this.refOverlay = React.createRef();
        this.refOverlayFrame = React.createRef();
        this.refInnerCanvas = React.createRef();
        this.refResultsCanvas = React.createRef();
        this.refInstructions = React.createRef();
        this.state = {
            images: [],
            selectedCamera: window.localStorage.getItem('selectedCamera') || '',
            cameras: null,
            oneFaceDetected: false,
            takingSnapshots: false,
        };
    }

    async componentDidMount(): Promise<void> {
        await this.init();
        this.modelLoaded = Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri('./models'),
            faceapi.nets.faceLandmark68TinyNet.loadFromUri('./models'),
        ]);
    }

    componentWillUnmount(): void {
        if (this.detectionTimeout) {
            clearTimeout(this.detectionTimeout);
            this.detectionTimeout = null;
        }
        if (this.refVideo.current) {
            this.refVideo.current.pause();
            this.refVideo.current.onloadedmetadata = null;
            this.refVideo.current.src = '';
            this.refVideo.current.load();
        }
    }

    static async getVideoDevices(): Promise<MediaDeviceInfo[]> {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const uniqueDevices: MediaDeviceInfo[] = [];
        devices.forEach(device => {
            if (device.kind === 'videoinput') {
                if (!uniqueDevices.find(dev => dev.deviceId === device.deviceId)) {
                    uniqueDevices.push(device);
                }
            }
        });
        return uniqueDevices;
    }

    drawOverlayOnCanvas(): void {
        if (this.refInnerCanvas.current) {
            // Fill th canvas with white and draw a circle in the middle with 80% of the width
            this.refInnerCanvas.current.width = this.refInnerCanvas.current.clientWidth;
            this.refInnerCanvas.current.height = this.refInnerCanvas.current.clientHeight;
            const context = this.refInnerCanvas.current.getContext('2d');
            if (context) {
                context.fillStyle = 'white';
                context.fillRect(0, 0, this.refInnerCanvas.current.width, this.refInnerCanvas.current.height);
                context.beginPath();
                context.arc(
                    this.refInnerCanvas.current.width / 2,
                    this.refInnerCanvas.current.height / 2,
                    this.refInnerCanvas.current.width * 0.4,
                    0,
                    2 * Math.PI,
                );
                context.fillStyle = 'rgba(0, 0, 0, 1)';
                context.fill();
            }
        }
    }

    static getAngle(detections: { detection: FaceDetection; landmarks: FaceLandmarks68 }): [0 | 1 | -1, number] {
        const eyeRight = getMeanPosition(detections.landmarks.getRightEye());
        const eyeLeft = getMeanPosition(detections.landmarks.getLeftEye());
        const nose = getMeanPosition(detections.landmarks.getNose());
        const mouth = getMeanPosition(detections.landmarks.getMouth());
        const jaw = getTop(detections.landmarks.getJawOutline());

        const rx = (jaw - mouth[1]) / detections.detection.box.height;
        const ry = (eyeLeft[0] + (eyeRight[0] - eyeLeft[0]) / 2 - nose[0]) / detections.detection.box.width;

        // const rry = ry < -0.04 ? -1 : ry >= 0.04 ? 1 : 0;
        const rrx = Math.abs(rx) > 0.65 ? -1 : Math.abs(rx) < 0.45 ? 1 : 0;

        // console.log(`rx: ${rx} => ${rrx}, ry: ${ry} => ${rry}`);

        return [rrx, ry];
    }

    videoHandler = async (): Promise<void> => {
        this.detectionTimeout = null;
        const texts: string[] = [];
        const context = this.refResultsCanvas.current?.getContext('2d');

        if (context && this.refResultsCanvas.current) {
            const displaySize = {
                width: this.refResultsCanvas.current.clientWidth,
                height: this.refResultsCanvas.current.clientHeight,
            };
            if (
                this.refResultsCanvas.current.width !== displaySize.width ||
                this.refResultsCanvas.current.height !== displaySize.height
            ) {
                this.refResultsCanvas.current.width = displaySize.width;
                this.refResultsCanvas.current.height = displaySize.height;
            }

            if (this.refVideo.current && this.context2 && this.refCanvas.current) {
                const detection = await faceapi
                    .detectSingleFace(this.refVideo.current, new faceapi.TinyFaceDetectorOptions())
                    .withFaceLandmarks(true);

                if (context) {
                    context.clearRect(0, 0, displaySize.width, displaySize.height);
                    if (detection) {
                        // Detect minimal size and rotation
                        const resizedDetections = faceapi.resizeResults([detection.detection], displaySize);

                        const directions = Camera.getAngle(detection);
                        context.strokeStyle =
                            detection.detection.score > 0.7 &&
                            Math.abs(directions[1]) <= 0.04 &&
                            detection.detection.box.height > 150
                                ? '#00FF00'
                                : '#333';
                        context.lineWidth = 1;
                        context.strokeRect(
                            resizedDetections[0].box.x,
                            resizedDetections[0].box.y,
                            resizedDetections[0].box.width,
                            resizedDetections[0].box.height,
                        );
                        context.font = '24px serif';
                        // if (directions[0] === -1) {
                        //     // draw text ↑
                        //     context.fillText(
                        //         '↑',
                        //         resizedDetections[0].box.x + resizedDetections[0].box.width / 2,
                        //         resizedDetections[0].box.y + 10,
                        //     );
                        // } else if (directions[0] === 1) {
                        //     // draw text ↓
                        //     context.fillText(
                        //         '↓',
                        //         resizedDetections[0].box.x + resizedDetections[0].box.width / 2,
                        //         resizedDetections[0].box.y + 10,
                        //     );
                        // }
                        texts.push(
                            I18n.t(
                                'Face detected with score %s%',
                                Math.round(detection.detection.score * 100).toString(),
                            ),
                        );
                        if (directions[1] < -0.04) {
                            texts.push(I18n.t('Turn head to the right'));

                            // draw text ←
                            context.fillText(
                                '←',
                                resizedDetections[0].box.x + resizedDetections[0].box.width / 2,
                                resizedDetections[0].box.y + resizedDetections[0].box.height - 10,
                            );
                        } else if (directions[1] > 0.04) {
                            texts.push(I18n.t('Turn head to the left'));
                            // draw text ➔
                            context.fillText(
                                '➔',
                                resizedDetections[0].box.x + resizedDetections[0].box.width / 2,
                                resizedDetections[0].box.y + resizedDetections[0].box.height - 10,
                            );
                        }

                        if (detection.detection.box.height < 150) {
                            texts.push(I18n.t('Move closer'));
                        }
                        // check the size and position of head

                        if (
                            detection.detection.score > 0.7 &&
                            Math.abs(directions[1]) <= 0.04 &&
                            detection.detection.box.height > 150
                        ) {
                            if (this.state.takingSnapshots) {
                                console.log(`Angle: ${Math.round(directions[1] * 100)}`);
                                if (
                                    this.lastMovement.ts === 0 ||
                                    Math.abs(this.lastMovement.angle - Math.round(directions[1] * 100)) > 1
                                ) {
                                    this.lastMovement = { angle: Math.round(directions[1] * 100), ts: Date.now() };
                                    if (
                                        this.takeSnapshot(detection.detection.box) >=
                                        (this.props.numberOfSnapshots || 4)
                                    ) {
                                        this.setState({ takingSnapshots: false });
                                    }
                                } else if (Date.now() - this.lastMovement.ts > 10000) {
                                    this.setState({ takingSnapshots: false });
                                }
                            }

                            if (!this.state.oneFaceDetected) {
                                this.setState({ oneFaceDetected: true });
                            }
                        } else if (this.state.oneFaceDetected) {
                            this.setState({ oneFaceDetected: false });
                        }
                        this.detectionTimeout = setTimeout(this.videoHandler, 100);
                        if (this.refInstructions.current && this.refInstructions.current.innerText !== texts.join()) {
                            this.refInstructions.current.innerText = texts.join(', ');
                        }
                        return;
                    }
                }
            }
            // const size = Math.min(displaySize.width, displaySize.height);
            // context.fillStyle = 'rgba(255, 255, 255, 0.5)';
            // context.fillRect(0, 0, displaySize.width, displaySize.height);
            // context.globalCompositeOperation = 'destination-out';
            // context.beginPath();
            // context.arc(displaySize.width / 2, displaySize.height / 2, size * 0.3, 0, 2 * Math.PI);
            // // context.fillStyle = 'rgba(0, 0, 0, 0.5)';
            // context.fill();
            // context.globalCompositeOperation = 'source-over';
        }

        if (this.state.oneFaceDetected) {
            this.setState({ oneFaceDetected: false });
        }

        texts.push(I18n.t('No face detected'));
        if (this.refInstructions.current) {
            this.refInstructions.current.innerText = texts.join(', ');
        }

        this.detectionTimeout = setTimeout(this.videoHandler, 100);
    };

    startVideoHandler(): void {
        if (this.detectionTimeout) {
            return;
        }
        void this.modelLoaded?.then(() => {
            return this.videoHandler();
        });
    }

    async init(): Promise<void> {
        let selectedCamera = this.state.selectedCamera === 'default' ? '' : this.state.selectedCamera;

        const cameras = this.state.cameras || (await Camera.getVideoDevices());
        if (!selectedCamera || !cameras.find(camera => camera.deviceId === selectedCamera)) {
            selectedCamera = cameras[0].deviceId;
        }

        if (this.refVideo.current && this.refCanvas.current && this.initialized !== selectedCamera) {
            if (this.refOverlay.current) {
                this.refOverlay.current.style.opacity = '0';
            }
            this.context2 = this.context2 || this.refCanvas.current.getContext('2d');
            this.initialized = this.state.selectedCamera;

            this.setState({ cameras, selectedCamera: selectedCamera || 'default' }, async () => {
                if (typeof window.navigator.mediaDevices?.getUserMedia === 'function') {
                    const stream = await window.navigator.mediaDevices.getUserMedia({
                        audio: false,
                        video: {
                            deviceId: selectedCamera,
                            facingMode: 'user',
                            height: { min: 480 },
                        },
                    });

                    if (stream) {
                        this.refVideo.current!.srcObject = stream;
                        this.refVideo.current!.onloadedmetadata = async () => {
                            if (this.refVideo.current) {
                                await this.refVideo.current.play();
                                console.log(
                                    `Playing live media stream: ${this.refVideo.current.clientWidth}x${this.refVideo.current.clientHeight}`,
                                );
                                if (this.refOverlayFrame.current && this.refOverlay.current) {
                                    this.refOverlay.current.style.opacity = '1';
                                    this.refOverlayFrame.current.style.width = `${Math.floor(
                                        (this.refOverlay.current.clientHeight * 480) / 640,
                                    )}px`;

                                    // this.drawOverlayOnCanvas();
                                }
                                this.startVideoHandler();
                            }
                        };
                    }
                }
            });
        }
    }

    async componentDidUpdate(): Promise<void> {
        await this.init();
    }

    takeSnapshot(box: { x: number; y: number; height: number; width: number }): number {
        if (this.refVideo.current && this.context2 && this.refCanvas.current) {
            const images = [...this.state.images];
            this.refCanvas.current.height = this.refVideo.current.clientHeight;
            this.refCanvas.current.width = Math.round((this.refVideo.current.clientHeight * 480) / 640);

            // We need portrait
            this.context2.drawImage(
                this.refVideo.current,
                Math.floor(box.x + (box.width - this.refCanvas.current.width) / 2),
                0,
                this.refCanvas.current.width,
                this.refVideo.current.clientHeight,
                0,
                0,
                this.refCanvas.current.width,
                this.refVideo.current.clientHeight,
            );
            images.push(this.refCanvas.current.toDataURL('image/jpeg'));
            if (images.length > 4) {
                images.splice(0, images.length - 4);
            }
            this.setState({ images }, () => this.props.onImagesUpdate(this.state.images));
            return images.length;
        }
        return this.state.images.length;
    }

    renderImage(index: number): React.JSX.Element {
        return (
            <div
                key={index}
                style={{ position: 'relative', width: 200, borderRadius: 5 }}
            >
                <IconButton
                    style={{
                        position: 'absolute',
                        top: 4,
                        right: 4,
                        opacity: 0.7,
                    }}
                    disabled={!!this.props.disabled}
                    onClick={() => {
                        const images = [...this.state.images];
                        images.splice(index, 1);
                        this.setState({ images }, () => this.props.onImagesUpdate(this.state.images));
                    }}
                >
                    <Delete />
                </IconButton>

                <img
                    style={{ width: '100%', height: 'auto' }}
                    key={index}
                    src={this.state.images[index]}
                    alt="screenshot"
                />
            </div>
        );
    }

    render(): React.JSX.Element {
        return (
            <div
                style={{
                    width: '100%',
                    height: this.props.height + 48,
                    display: 'flex',
                    flexDirection: 'row',
                    gap: 8,
                }}
            >
                <canvas
                    style={{ opacity: 0, position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
                    ref={this.refCanvas}
                    id={this.props.id}
                    width={100}
                    height={100}
                ></canvas>
                <div style={{ width: this.props.width, height: '100%' }}>
                    <Select
                        fullWidth
                        style={{ marginBottom: 16 }}
                        variant="standard"
                        disabled={!this.state.cameras || !!this.props.disabled}
                        value={this.state.selectedCamera || 'default'}
                        onChange={e => {
                            this.setState({ selectedCamera: e.target.value || 'default' }, async () => {
                                await this.init();
                            });
                        }}
                    >
                        {this.state.cameras?.map(camera => (
                            <MenuItem
                                key={camera.deviceId || 'default'}
                                value={camera.deviceId || 'default'}
                            >
                                {camera.label || I18n.t('default')}
                            </MenuItem>
                        ))}
                    </Select>
                    <div style={{ position: 'relative' }}>
                        <video
                            playsInline
                            ref={this.refVideo}
                            autoPlay
                            style={{
                                zIndex: 0,
                                width: 480,
                            }}
                        ></video>
                        <canvas
                            id="result"
                            ref={this.refResultsCanvas}
                            style={{
                                width: '100%',
                                height: '100%',
                                zIndex: 2,
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                opacity: 0.8,
                            }}
                        ></canvas>
                        {this.state.takingSnapshots && this.state.images.length ? <div
                            style={{
                                color: '#000080',
                                position: 'absolute',
                                top: 3,
                                left: 0,
                                textAlign: 'center',
                                width: '100%',
                                opacity: 0.8,
                            }}
                        >{I18n.t('Turn your head slightly')}</div> : null}
                    </div>
                    <div ref={this.refInstructions}></div>
                </div>
                <div>
                    <div style={{ width: '100%' }}>
                        <Button
                            disabled={
                                !!this.props.disabled || (!this.state.takingSnapshots && !this.state.oneFaceDetected)
                            }
                            onClick={() => {
                                this.lastMovement = { angle: 0, ts: 0 };
                                if (this.state.takingSnapshots) {
                                    this.setState({ oneFaceDetected: false, takingSnapshots: false });
                                } else {
                                    this.setState({ oneFaceDetected: false, takingSnapshots: true, images: [] });
                                }
                            }}
                            variant="outlined"
                            startIcon={
                                this.state.takingSnapshots ? <Stop /> : <FiberManualRecord style={{ color: 'red' }} />
                            }
                        >
                            {this.state.takingSnapshots ? I18n.t('Stop') : I18n.t('Screenshot')}
                        </Button>
                        {this.props.onVerifyAllPersonsChanged ? (
                            <FormControlLabel
                                style={{ marginLeft: 16 }}
                                control={
                                    <Checkbox
                                        disabled={!!this.props.disabled}
                                        checked={this.props.verifyAllPersons}
                                        onChange={() =>
                                            this.props.onVerifyAllPersonsChanged!(!this.props.verifyAllPersons)
                                        }
                                    />
                                }
                                label={I18n.t('Check all persons')}
                            />
                        ) : null}
                        {this.state.images.length ? (
                            <Button
                                disabled={!!this.props.disabled}
                                onClick={() => this.setState({ images: [] }, () => this.props.onImagesUpdate([]))}
                                variant="outlined"
                            >
                                {I18n.t('Clear all')}
                            </Button>
                        ) : null}
                    </div>

                    <div style={{ display: 'flex', gap: 4, marginTop: 12, flexWrap: 'wrap' }}>
                        {this.state.images.map((_image, i) => this.renderImage(i))}
                    </div>
                </div>
            </div>
        );
    }
}
