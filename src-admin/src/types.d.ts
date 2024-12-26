export type USER_EMAIL = string;
export type PERSON_ID = string;
export type ISO_TIME = string;
export type ENGINE = 'iobroker' | 'advanced';
export type TOKEN = string;

export type FaceAdapterConfig = {
    engine: ENGINE;
    login: string;
    password: string;
};
