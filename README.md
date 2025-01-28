![Logo](admin/face.png)
# ioBroker Face Detection Adapter

![Number of Installations](http://iobroker.live/badges/face-installed.svg)
![Number of Installations](http://iobroker.live/badges/face-stable.svg)
[![NPM version](http://img.shields.io/npm/v/iobroker.face.svg)](https://www.npmjs.com/package/iobroker.face)

![Test and Release](https://github.com/ioBroker/ioBroker.face/workflows/Test%20and%20Release/badge.svg)
[![Translation status](https://weblate.iobroker.net/widgets/adapters/-/face/svg-badge.svg)](https://weblate.iobroker.net/engage/adapters/?utm_source=widget)
[![Downloads](https://img.shields.io/npm/dm/iobroker.face.svg)](https://www.npmjs.com/package/iobroker.face)

**This adapter uses Sentry libraries to automatically report exceptions and code errors to the developers.** For more details and for information how to disable the error reporting see [Sentry-Plugin Documentation](https://github.com/ioBroker/plugin-sentry#plugin-sentry)! Sentry reporting is used starting with js-controller 3.0.

## Description
This adapter uses cloud engine to detect and identify faces on the images. It can be used to identify the person on the image.

Before start, you need a running account on https://iobroker.pro and subscription for Assistant or Remote connection.

After that, the persons must be created and trained. This can be done in the settings of the adapter on the "persons" tab. Maximum 10 people can be created.

## Usage
### Messages
As the persons are created and trained, you can send the images in base64 format to the adapter, and it will try to identify the person on the image.
It is better to send 2 or more images to detect liveness of the images.

```js
sendTo('face.0', 'verify', { images: ['data:image/jpeg;base64,...'] }, (res) => {
    console.log('Detected person: ' + res.person);
});
```

Image can be encoded as:
- URL to the image, like `http://example.com/image.jpg`
- Base64 encoded image, like `data:image/jpeg;base64,...`
- ioBroker URL, like `iobstate://0_userdata.0.image/val` (`/val` is optional). State could be again URL to the image, Base64 encoded image or ioBroker URL. Up to 3 recursive levels are supported.
- ioBroker URL, like `iobobject://system.adapter.face.0/common.extIcon`

If person is detected, the state `face.X.persons.<PERSON>` will be set to true with no acknowledgement.

### States
The following states are created:
- `face.X.persons.<PERSON>` - Every created person will have the state. If the person is detected, the state will be set to true.
- `face.X.images.upload` - Write to this state the image format described above to detect the person on the image.
- `face.X.images.uploaded` - Current number of uploaded images. We suggest uploading of 2 or more images to detect the liveness. If the image is older than 15 seconds it will be removed from the queue.
- `face.X.images.verify` - Trigger the identification of the person on the uploaded images.
- `face.X.images.enroll` - Trigger the training of the person that is defined in this state on the uploaded images.
- `face.X.images.uploadResult` - The result of the detection or enrollment. If the person is detected, the state `face.X.persons.<PERSON>` will be set to true and the `face.X.images.uploadResult` to the person ID.

The following values could be in `face.X.images.uploadResult`:
- `PERSON_ID` - The person ID that was detected on the images.
- `<no person>` - No person was identified on the images.
- `<authentication error>` - Credentials are wrong or the subscription is expired.
- `<no images>` - No images were uploaded.
- `<cannot enroll>` - Cannot enroll the person. The person is not created or not trained.
- `<person not found>` - Person that should be enrolled is not found.
- `<ERROR_TEXT>` - Any other error.

## Todo
- [ ] Check in backend if some person is found on the image and if not do not send the image to the cloud.
- [ ] Add an option to check the images in backend before sending to the cloud (in the configuration).

<!--
	Placeholder for the next version (at the beginning of the line):
	### **WORK IN PROGRESS**
-->

## Changelog
### **WORK IN PROGRESS**
* (@GermanBluefox) Added possibility to take pictures via cloud

### 0.0.2 (2025-01-01)
* (@GermanBluefox) Initial commit

## License
Apache-2.0

Copyright (c) 2024-2025 Denis Haev <dogafox@gmail.com>
