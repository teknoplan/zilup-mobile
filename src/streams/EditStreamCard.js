/* @flow strict-local */
import React, { useState, useCallback, useMemo, useEffect, useContext } from 'react';
import type { Node } from 'react';
import { View, Alert } from 'react-native';

import type { Privacy } from './streamsActions';
import { ensureUnreachable } from '../types';
import { useSelector } from '../react-redux';
import { getRealm, getOwnUser, getRealmUrl } from '../selectors';
import { Role } from '../api/permissionsTypes';
import { getCanCreateWebPublicStreams } from '../permissionSelectors';
import type { AppNavigationProp } from '../nav/AppNavigator';
import Input from '../common/Input';
import InputRowRadioButtons from '../common/InputRowRadioButtons';
import ZulipTextIntl from '../common/ZulipTextIntl';
import ZulipButton from '../common/ZulipButton';
import styles from '../styles';
import { TranslationContext } from '../boot/TranslationProvider';

/* eslint-disable no-shadow */

type PropsBase = $ReadOnly<{|
  navigation: AppNavigationProp<'edit-stream' | 'create-stream'>,

  initialValues: {|
    name: string,
    description: string,
    privacy: Privacy,
  |},
|}>;

type PropsEditStream = $ReadOnly<{|
  ...PropsBase,

  isNewStream: false,
  onComplete: (changedValues: {|
    // Properties optional because some values might not have changed.

    +name?: string,
    +description?: string,
    +privacy?: Privacy,
  |}) => boolean | Promise<boolean>,
|}>;

type PropsCreateStream = $ReadOnly<{|
  ...PropsBase,

  isNewStream: true,
  onComplete: ({| name: string, description: string, privacy: Privacy |}) =>
    | boolean
    | Promise<boolean>,
|}>;

type Props = $ReadOnly<PropsEditStream | PropsCreateStream>;

/**
 * Most user-facing strings come from stream_privacy_policy_values in
 * static/js/stream_data.js. The ones in `disabledIfNotInitialValue` are the
 * exception; I made them up.
 */
function useStreamPrivacyOptions(initialValue: Privacy) {
  const {
    webPublicStreamsEnabled,
    enableSpectatorAccess,
    createWebPublicStreamPolicy,
    name: realmName,
  } = useSelector(getRealm);
  const canCreateWebPublicStreams = useSelector(getCanCreateWebPublicStreams);
  const { role } = useSelector(getOwnUser);
  const realmUrl = useSelector(getRealmUrl);

  return useMemo(
    () =>
      [
        !(webPublicStreamsEnabled && enableSpectatorAccess)
          ? undefined
          : {
              key: 'web-public',
              title: 'Web-public',
              subtitle:
                'Organization members can join (guests must be invited by a subscriber); anyone on the Internet can view complete message history without creating an account',

              // See comment where we use this.
              disabledIfNotInitialValue: !canCreateWebPublicStreams && {
                title: 'Insufficient permission',
                message: (() => {
                  switch (createWebPublicStreamPolicy) {
                    // FlowIssue: sad that we end up having to write numeric literals here :-/
                    //   But the most important thing to get from the type-checker here is
                    //   that the ensureUnreachable works -- that ensures that when we add a
                    //   new possible value, we'll add a case for it here.  Couldn't find a
                    //   cleaner way to write this that still accomplished that. Discussion:
                    //     https://github.com/zulip/zulip-mobile/pull/5384#discussion_r875147220
                    case 6: // CreateWebPublicStreamPolicy.Nobody
                      return {
                        text:
                          role === Role.Admin || role === Role.Owner
                            ? '{realmName} does not allow anybody to make web-public streams. To change this setting, please open {realmUrl} in your browser.'
                            : '{realmName} does not allow anybody to make web-public streams.',
                        values: { realmName, realmUrl: realmUrl.toString() },
                      };
                    case 7: // CreateWebPublicStreamPolicy.OwnerOnly
                      return {
                        text:
                          role === Role.Admin
                            ? '{realmName} only allows organization owners to make web-public streams. To change this setting, please open {realmUrl} in your browser.'
                            : '{realmName} only allows organization owners to make web-public streams.',
                        values: { realmName, realmUrl: realmUrl.toString() },
                      };
                    case 2: // CreateWebPublicStreamPolicy.AdminOrAbove
                      return {
                        text:
                          '{realmName} only allows organization administrators or owners to make web-public streams.',
                        values: { realmName },
                      };
                    case 4: // CreateWebPublicStreamPolicy.ModeratorOrAbove
                      return {
                        text:
                          '{realmName} only allows organization moderators, administrators, or owners to make web-public streams.',
                        values: { realmName },
                      };
                    default: {
                      ensureUnreachable(createWebPublicStreamPolicy);

                      // (Unreachable as long as the cases are exhaustive.)
                      return '';
                    }
                  }
                })(),
                learnMoreUrl:
                  role === Role.Admin || role === Role.Owner
                    ? new URL('/help/configure-who-can-create-streams', realmUrl)
                    : undefined,
              },
            },
        {
          key: 'public',
          title: 'Public',
          subtitle:
            'Organization members can join (guests must be invited by a subscriber); organization members can view complete message history without joining',
        },
        {
          key: 'invite-only-public-history',
          title: 'Private, shared history',
          subtitle:
            'Must be invited by a subscriber; new subscribers can view complete message history; hidden from non-administrator users',
        },
        {
          key: 'invite-only',
          title: 'Private, protected history',
          subtitle:
            'Must be invited by a subscriber; new subscribers can only see messages sent after they join; hidden from non-administrator users',
        },
      ]
        .filter(Boolean)
        .map(x => {
          const { disabledIfNotInitialValue = false, ...rest } = x;

          return {
            ...rest,

            // E.g., if editing an existing stream that's already
            // web-public, let the user keep it that way, even if they
            // wouldn't have permission to switch to web-public from
            // something else. In particular, as the user is filling out the
            // form, let them accidentally choose a different setting, then
            // switch back to the first setting without making them submit
            // the accidental setting or restart the app.
            disabled: x.key !== initialValue && disabledIfNotInitialValue,
          };
        }),
    [
      initialValue,
      webPublicStreamsEnabled,
      canCreateWebPublicStreams,
      createWebPublicStreamPolicy,
      enableSpectatorAccess,
      realmName,
      realmUrl,
      role,
    ],
  );
}

export default function EditStreamCard(props: Props): Node {
  const { navigation, initialValues, isNewStream } = props;
  const _ = useContext(TranslationContext);

  const [name, setName] = useState<string>(props.initialValues.name);
  const [description, setDescription] = useState<string>(props.initialValues.description);
  const [privacy, setPrivacy] = useState<Privacy>(props.initialValues.privacy);
  // When adding more, update areInputsTouched.

  const [awaitingUserInput, setAwaitingUserInput] = useState<boolean>(true);
  const areInputsTouched =
    name !== initialValues.name
    || description !== initialValues.description
    || privacy !== initialValues.privacy;

  useEffect(
    () =>
      /* $FlowFixMe[prop-missing]: Get Flow types for
       react-navigation/react-navigation@6925e92dc */
      navigation.addListener('beforeRemove', e => {
        if (!(awaitingUserInput && areInputsTouched)) {
          return;
        }

        e.preventDefault();

        Alert.alert(
          _('Discard changes?'),
          _('You have unsaved changes. Leave without saving?'),
          [
            { text: _('Cancel'), style: 'cancel' },
            {
              text: _('Discard'),
              style: 'destructive',

              /* $FlowFixMe[prop-missing]: Get Flow types for
               react-navigation/react-navigation@6925e92dc */
              onPress: () => navigation.dispatch(e.data.action),
            },
          ],
          { cancelable: true },
        );
      }),
    [_, areInputsTouched, navigation, awaitingUserInput],
  );

  const handlePerformAction = useCallback(async () => {
    setAwaitingUserInput(false);
    let result = false;
    try {
      if (props.isNewStream) {
        result = await props.onComplete({ name, description, privacy });
      } else {
        result = await props.onComplete({
          name: initialValues.name !== name ? name : undefined,
          description: initialValues.description !== description ? description : undefined,
          privacy: initialValues.privacy !== privacy ? privacy : undefined,
        });
      }
    } finally {
      if (result) {
        navigation.goBack();
      } else {
        setAwaitingUserInput(true);
      }
    }
  }, [props, navigation, initialValues, name, description, privacy]);

  const privacyOptions = useStreamPrivacyOptions(props.initialValues.privacy);

  return (
    <View>
      <ZulipTextIntl text="Name" />
      <Input
        style={styles.marginBottom}
        placeholder="Name"
        autoFocus
        defaultValue={initialValues.name}
        onChangeText={setName}
      />
      <ZulipTextIntl text="Description" />
      <Input
        style={styles.marginBottom}
        placeholder="Description"
        defaultValue={initialValues.description}
        onChangeText={setDescription}
      />
      <InputRowRadioButtons
        navigation={navigation}
        label="Privacy"
        description="Who can access the stream?"
        items={privacyOptions}
        valueKey={privacy}
        onValueChange={setPrivacy}
      />
      <ZulipButton
        style={styles.marginTop}
        text={isNewStream ? 'Create' : 'Save'}
        disabled={name.length === 0}
        onPress={handlePerformAction}
      />
    </View>
  );
}
