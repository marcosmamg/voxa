'use strict';

const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');

chai.use(chaiAsPromised);

const expect = chai.expect;
const AlexaSkill = require('../lib/AlexaSkill');
const simple = require('simple-mock');
const _ = require('lodash');

describe('AlexaSkill', () => {
  it('should not return error message on wrong appId', () => {
    const alexaSkill = new AlexaSkill('MY APP ID', {});
    alexaSkill.onLaunchRequest(() => {});
    const stub = simple.stub();
    alexaSkill.onError(stub);

    return alexaSkill.execute({ session: { application: { applicationId: 'OTHER APP ID' } }, request: { type: 'IntentRequest', intent: { } } })
      .then(() => {
        expect(stub.called).to.be.false;
      });
  });
  it('should return error message on wrong appId if env === production', () => {
    const alexaSkill = new AlexaSkill('MY APP ID', { env: 'production' });
    alexaSkill.onLaunchRequest(() => {});
    const stub = simple.stub();
    alexaSkill.onError(stub);

    return alexaSkill.execute({ session: { application: { applicationId: 'OTHER APP ID' } }, request: { intent: { } } })
      .then((result) => {
        expect(stub.called).to.be.true;
        expect(stub.lastCall.args[1]).to.be.an('error');
        expect(stub.lastCall.args[1].message).to.equal('Invalid applicationId');
        expect(result).to.deep.equal({
          version: '1.0',
          response: {
            card: undefined,
            outputSpeech: {
              ssml: '<speak>An unrecoverable error occurred.</speak>',
              type: 'SSML',
            },
            shouldEndSession: true,
          },
        });
      });
  });

  it('should return error message if onLaunchRequest is not overriden', () => {
    const alexaSkill = new AlexaSkill('MY APP ID', { env: 'production' });
    const stub = simple.stub();
    alexaSkill.onError(stub);
    return alexaSkill.execute({ session: { application: { applicationId: 'MY APP ID' } }, request: { type: 'IntentRequest', intent: { slots: [], name: 'UnsupportedIntent' } } })
      .then((result) => {
        expect(stub.lastCall.args[1]).to.be.an('error');
        expect(stub.lastCall.args[1].message).to.equal('onLaunchRequest must be implemented');
        expect(result).to.deep.equal({
          version: '1.0',
          response: {
            card: undefined,
            outputSpeech: {
              ssml: '<speak>An unrecoverable error occurred.</speak>',
              type: 'SSML',
            },
            shouldEndSession: true,
          },
        });
      });
  });

  it('should return error message on malformed request', () => {
    const alexaSkill = new AlexaSkill('appId', { env: 'production' });
    alexaSkill.onLaunchRequest(() => {});
    const promise = alexaSkill.execute({});
    return expect(promise).to.eventually.deep.equal({
      version: '1.0',
      response: {
        card: undefined,
        outputSpeech: {
          ssml: '<speak>An unrecoverable error occurred.</speak>',
          type: 'SSML',
        },
        shouldEndSession: true,
      },
    });
  });

  it('should iterate through error handlers and return the first with a truthy response', () => {
    const alexaSkill = new AlexaSkill('MY APP ID');
    alexaSkill.onLaunchRequest(() => {});

    const handler1 = simple.stub().returnWith(null);
    const handler2 = simple.stub().returnWith(null);
    const handler3 = simple.stub().returnWith({
      version: '1.0',
      response: {
        card: undefined,
        outputSpeech: {
          ssml: '<speak>An unrecoverable error occurred.</speak>',
          type: 'SSML',
        },
        shouldEndSession: true,
      },
    });

    alexaSkill.onError(handler1);
    alexaSkill.onError(handler2);
    alexaSkill.onError(handler3);

    return alexaSkill.execute({})
      .then((response) => {
        expect(handler1.called).to.be.true;
        expect(handler2.called).to.be.true;
        expect(handler3.called).to.be.true;
        expect(response).to.deep.equal(handler3());
      });
  });

  _.map([
    'AudioPlayer.PlaybackStarted',
    'AudioPlayer.PlaybackFinished',
    'AudioPlayer.PlaybackNearlyFinished',
    'AudioPlayer.PlaybackStopped',
    'AudioPlayer.PlaybackFailed',
    'System.ExceptionEncountered',
    'PlaybackController.NextCommandIssued',
    'PlaybackController.PauseCommandIssued',
    'PlaybackController.PlayCommandIssued',
    'PlaybackController.PreviousCommandIssued',
  ], (requestType) => {
    it(`should call the correct handler for ${requestType}`, () => {
      const alexaSkill = new AlexaSkill('MY APP ID', { env: 'production' });
      alexaSkill.onLaunchRequest(() => {});
      const stub = simple.stub().resolveWith(`RequestType: ${requestType}`);
      alexaSkill[`on${requestType}`](stub);
      const event = { session: { application: { applicationId: 'MY APP ID' } }, request: { type: requestType } };

      return alexaSkill.execute(event)
        .then((result) => {
          expect(stub.called).to.be.true;
          expect(result).to.equal(`RequestType: ${requestType}`);
        });
    });
  });

  it('should return error message on unknown event type', () => {
    const alexaSkill = new AlexaSkill('MY APP ID', { env: 'production' });
    alexaSkill.onLaunchRequest(() => {});
    const stub = simple.stub();
    alexaSkill.onError(stub);
    return alexaSkill.execute({ session: { application: { applicationId: 'MY APP ID' } }, request: { type: 'UnknownEvent' } })
      .then((result) => {
        expect(stub.lastCall.args[1]).to.be.an('error');
        expect(stub.lastCall.args[1].message).to.equal('Unkown request type: UnknownEvent');
        expect(result).to.deep.equal({
          version: '1.0',
          response: {
            card: undefined,
            outputSpeech: {
              ssml: '<speak>An unrecoverable error occurred.</speak>',
              type: 'SSML',
            },
            shouldEndSession: true,
          },
        });
      });
  });

  it('should succeed with version on onSessionEnded request', () => {
    const alexaSkill = new AlexaSkill('MY APP ID', { env: 'production' });
    alexaSkill.onLaunchRequest(() => {});
    const promise = alexaSkill.execute({ session: { application: { applicationId: 'MY APP ID' } }, request: { type: 'SessionEndedRequest' } });
    expect(promise).to.eventually.deep.equal({ version: '1.0' });
  });

  it('should call onSesionEnded callback', (done) => {
    const alexaSkill = new AlexaSkill('MY APP ID', { env: 'production' });
    alexaSkill.onLaunchRequest(() => {});
    const stub = simple.stub().returnWith(1);
    alexaSkill.onSessionEnded(stub);
    alexaSkill.execute({ session: { application: { applicationId: 'MY APP ID' } }, request: { type: 'SessionEndedRequest' } })
      .then((reply) => {
        expect(stub.called).to.be.true;
        done();
      })
      .catch(done);
  });

  it('should accept onRequestStart methods', () => {
    const alexaSkill = new AlexaSkill('MY APP ID', { env: 'production' });
    const onRequestStart = simple.stub();
    alexaSkill.onRequestStarted(onRequestStart);
  });

  it('should not call onSessionStarted if not session.new', () => {
    const alexaSkill = new AlexaSkill('MY APP ID', { env: 'production' });
    alexaSkill.onLaunchRequest(() => {});
    const stub = simple.stub().resolveWith(1);
    alexaSkill.onSessionStarted(stub);

    return alexaSkill.execute({ session: { new: false, application: { applicationId: 'MY APP ID' } }, request: { type: 'SessionEndedRequest' } })
      .then(() => {
        expect(stub.callCount).to.equal(0);
      });
  });

  it('should call onSessionStarted if session.new', () => {
    const alexaSkill = new AlexaSkill('MY APP ID', { env: 'production' });
    alexaSkill.onLaunchRequest(() => {});
    const stub = simple.stub().resolveWith(1);
    alexaSkill.onSessionStarted(stub);

    return alexaSkill.execute({ session: { new: true, application: { applicationId: 'MY APP ID' } }, request: { type: 'SessionEndedRequest' } })
      .then(() => {
        expect(stub.callCount).to.equal(1);
      });
  });

  it('should call all onRequestStartCallbacks', () => {
    const alexaSkill = new AlexaSkill('appId', { env: 'production' });
    alexaSkill.onLaunchRequest(() => {});
    const onRequestStart1 = simple.stub().returnWith(1);
    const onRequestStart2 = simple.stub().returnWith(1);
    const onRequestStart3 = simple.stub().returnWith(1);

    alexaSkill.onRequestStarted(onRequestStart1);
    alexaSkill.onRequestStarted(onRequestStart2);
    alexaSkill.onRequestStarted(onRequestStart3);

    return alexaSkill.execute({ session: { new: true, application: { applicationId: 'appId' } }, request: { type: 'SessionEndedRequest' } })
      .then(() => {
        expect(onRequestStart1.called).to.be.true;
        expect(onRequestStart2.called).to.be.true;
        expect(onRequestStart3.called).to.be.true;
      });
  });

  it('should accept an array of appIds', () => {
    const alexaSkill = new AlexaSkill(['appId1', 'appId2'], { env: 'production' });
    alexaSkill.onLaunchRequest(() => {});
    return alexaSkill.execute({ session: { new: true, application: { applicationId: 'appId2' } }, request: { type: 'SessionEndedRequest' } });
  });
});
