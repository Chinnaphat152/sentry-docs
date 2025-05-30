'use client';

import {Fragment, useContext, useState} from 'react';
import {createPortal} from 'react-dom';
import {usePopper} from 'react-popper';
import {AnimatePresence} from 'framer-motion';
import {useTheme} from 'next-themes';

import {useOnClickOutside} from 'sentry-docs/clientUtils';
import {useIsMounted} from 'sentry-docs/hooks/isMounted';

import {CodeContext, createOrgAuthToken} from '../codeContext';

import {AnimatedContainer} from './animatedContainer';
import {Keyword} from './keyword';
import {
  Arrow,
  Dropdown,
  DropdownHeader,
  ItemButton,
  KeywordDropdown,
  PositionWrapper,
  Selections,
} from './styles.css';
import {dropdownPopperOptions} from './utils';

type TokenState =
  | {status: 'none'}
  | {status: 'loading'}
  | {status: 'success'; token: string}
  | {status: 'error'};

export function OrgAuthTokenCreator() {
  const [tokenState, setTokenState] = useState<TokenState>({status: 'none'});
  const [isOpen, setIsOpen] = useState(false);
  const [referenceEl, setReferenceEl] = useState<HTMLSpanElement | null>(null);
  const [dropdownEl, setDropdownEl] = useState<HTMLElement | null>(null);
  const {styles, state, attributes} = usePopper(
    referenceEl,
    dropdownEl,
    dropdownPopperOptions
  );
  const [isAnimating, setIsAnimating] = useState(false);
  const {resolvedTheme: theme} = useTheme();
  const isDarkMode = theme === 'dark';

  const {isMounted} = useIsMounted();

  useOnClickOutside({
    ref: {current: referenceEl},
    enabled: isOpen,
    handler: () => setIsOpen(false),
  });

  const updateSelectedOrg = (orgSlug: string) => {
    const choices = codeKeywords.PROJECT ?? [];
    const currentSelectionIdx = sharedSelection.PROJECT ?? 0;
    const currentSelection = choices[currentSelectionIdx];

    // Already selected correct org, nothing to do
    if (currentSelection && currentSelection.ORG_SLUG === orgSlug) {
      return;
    }

    // Else, select first project of the selected org
    const newSelectionIdx = choices.findIndex(choice => choice.ORG_SLUG === orgSlug);
    if (newSelectionIdx > -1) {
      const newSharedSelection = {...sharedSelection};
      newSharedSelection.PROJECT = newSelectionIdx;
      setSharedSelection(newSharedSelection);
    }
  };

  const createToken = async (orgSlug: string) => {
    setTokenState({status: 'loading'});
    const token = await createOrgAuthToken({
      orgSlug,
      name: `Generated by Docs on ${new Date().toISOString().slice(0, 10)}`,
    });

    if (token) {
      setTokenState({
        status: 'success',
        token,
      });

      updateSelectedOrg(orgSlug);
    } else {
      setTokenState({
        status: 'error',
      });
    }
  };

  const codeContext = useContext(CodeContext);
  if (!codeContext) {
    return null;
  }
  const {codeKeywords, sharedKeywordSelection} = codeContext;
  const [sharedSelection, setSharedSelection] = sharedKeywordSelection;

  const orgSet = new Set<string>();
  codeKeywords?.PROJECT?.forEach(projectKeyword => {
    orgSet.add(projectKeyword.ORG_SLUG);
  });
  const orgSlugs = [...orgSet];

  if (!codeKeywords.USER) {
    // User is not logged in - show dummy token
    return <Fragment>sntrys_YOUR_TOKEN_HERE</Fragment>;
  }

  if (tokenState.status === 'success') {
    return <span className="whitespace-pre-wrap break-all">{tokenState.token}</span>;
  }

  if (tokenState.status === 'error') {
    return <Fragment>There was an error while generating your token.</Fragment>;
  }

  if (tokenState.status === 'loading') {
    return <Fragment>Generating token...</Fragment>;
  }

  const selector = isOpen && (
    <PositionWrapper style={styles.popper} ref={setDropdownEl} {...attributes.popper}>
      <DropdownHeader>Select an organization:</DropdownHeader>
      <AnimatedContainer>
        <Dropdown dark={isDarkMode}>
          <Arrow
            style={styles.arrow}
            data-placement={state?.placement}
            data-popper-arrow
          />
          <Selections>
            {orgSlugs.map(org => {
              return (
                <ItemButton
                  data-sentry-mask
                  key={org}
                  isActive={false}
                  onClick={() => {
                    createToken(org);
                    setIsOpen(false);
                  }}
                  dark={isDarkMode}
                >
                  {org}
                </ItemButton>
              );
            })}
          </Selections>
        </Dropdown>
      </AnimatedContainer>
    </PositionWrapper>
  );

  const handlePress = () => {
    if (orgSlugs.length === 1) {
      createToken(orgSlugs[0]);
    } else {
      setIsOpen(!isOpen);
    }
  };

  return (
    <Fragment>
      <KeywordDropdown
        ref={setReferenceEl}
        role="button"
        title="Click to generate token (DO NOT commit)"
        tabIndex={0}
        onClick={() => {
          handlePress();
        }}
        onKeyDown={e => {
          if (['Enter', 'Space'].includes(e.key)) {
            handlePress();
          }
        }}
      >
        <span
          style={{
            // We set inline-grid only when animating the keyword so they
            // correctly overlap during animations, but this must be removed
            // after so copy-paste correctly works.
            display: isAnimating ? 'inline-grid' : undefined,
          }}
        >
          <AnimatePresence initial={false}>
            <Keyword
              onAnimationStart={() => setIsAnimating(true)}
              onAnimationComplete={() => setIsAnimating(false)}
            >
              Click to generate token (DO NOT commit)
            </Keyword>
          </AnimatePresence>
        </span>
      </KeywordDropdown>
      {isMounted &&
        createPortal(<AnimatePresence>{selector}</AnimatePresence>, document.body)}
    </Fragment>
  );
}
