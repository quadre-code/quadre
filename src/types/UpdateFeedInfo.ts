/* eslint-disable */

export interface UpdateFeedInfoItem {
    buildNumber: string;
    versionString: string;
    dateString: string;
    releaseNotesURL: string;
    downloadURL: string;
    newFeatures: Array<any>;
}

type UpdateFeedInfo = Array<UpdateFeedInfoItem>;

export default UpdateFeedInfo;
